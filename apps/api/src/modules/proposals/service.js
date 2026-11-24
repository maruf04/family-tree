// Change proposals: members suggest genealogy edits, moderators review them.
// Approval applies every item in ONE transaction (app.proposal_id set, so the
// audit log links each change to the proposal). Any failure — a cycle, a
// conflict with a newer edit, a constraint — rolls the whole proposal back and
// it stays pending.
import { query, withTransaction } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { notify, notifyModerators } from '../notifications/service.js';
import {
  ENTITIES, createRecord, deleteRecord, normalizeValue, parsePayload, resolveRefs, snapshotRecord, updateRecord,
} from '../genealogy/writer.js';

const ACTIONS = ['create', 'update', 'delete'];

export async function submitProposal(viewer, requestId, { familyId, summary, rationale, items }) {
  const prepared = items.map((item, i) => {
    if (!ENTITIES[item.entity_type]) throw badRequest('invalid_entity', `Unknown entity ${item.entity_type}`);
    if (!ACTIONS.includes(item.action)) throw badRequest('invalid_action', `Unknown action ${item.action}`);
    if (item.action !== 'create' && !item.target_id) throw badRequest('validation_failed', `Item ${i + 1}: target_id required`);
    if (item.action === 'create' && item.target_id) throw badRequest('validation_failed', `Item ${i + 1}: create has no target_id`);
    const payload = parsePayload(item.entity_type, item.action, item.payload, { isModerator: false });
    return { ...item, payload, position: i + 1 };
  });
  // References must point at temp_refs of earlier items.
  const known = new Set();
  for (const item of prepared) {
    for (const v of Object.values(item.payload)) {
      if (typeof v === 'string' && v.startsWith('$') && !known.has(v.slice(1))) {
        throw badRequest('unknown_reference', `Unknown reference ${v}`);
      }
    }
    if (item.temp_ref) known.add(item.temp_ref);
  }

  return withTransaction({ userId: viewer.id, requestId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO change_proposals (proposer_id, family_id, summary, rationale)
       VALUES ($1, $2, $3, $4) RETURNING id`, [viewer.id, familyId ?? null, summary, rationale ?? null]);
    const proposalId = rows[0].id;
    for (const item of prepared) {
      const snapshot = item.action === 'create' ? null : await snapshotRecord(db, item.entity_type, item.target_id);
      await db.query(
        `INSERT INTO change_proposal_items
           (proposal_id, position, entity_type, action, target_id, temp_ref, payload, base_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [proposalId, item.position, item.entity_type, item.action, item.target_id ?? null,
          item.temp_ref ?? null, JSON.stringify(item.payload), snapshot ? JSON.stringify(snapshot) : null]);
    }
    await notifyModerators(db, {
      kind: 'proposal_submitted', titleBn: `নতুন সংশোধন প্রস্তাব: ${summary}`, titleEn: `New change proposal: ${summary}`,
      link: `/proposals/${proposalId}`,
    }, { exceptUserId: viewer.id });
    return proposalId;
  });
}

const PROPOSAL_COLUMNS = `
  cp.id, cp.summary, cp.rationale, cp.status, cp.family_id, cp.created_at, cp.reviewed_at, cp.review_note,
  cp.applied_at, cp.proposer_id, cp.reviewed_by,
  pu.display_name_bn AS proposer_name_bn, pu.display_name_en AS proposer_name_en,
  ru.display_name_bn AS reviewer_name_bn, ru.display_name_en AS reviewer_name_en,
  f.name_bn AS family_name_bn, f.name_en AS family_name_en,
  (SELECT count(*) FROM change_proposal_items i WHERE i.proposal_id = cp.id) AS item_count`;
const PROPOSAL_JOINS = `
  LEFT JOIN users pu ON pu.id = cp.proposer_id
  LEFT JOIN users ru ON ru.id = cp.reviewed_by
  LEFT JOIN families f ON f.id = cp.family_id`;

export async function listProposals({ proposerId, status, familyId, limit = 50 }) {
  const params = [];
  const where = [];
  if (proposerId) { params.push(proposerId); where.push(`cp.proposer_id = $${params.length}`); }
  if (status) { params.push(status); where.push(`cp.status = $${params.length}`); }
  if (familyId) { params.push(familyId); where.push(`cp.family_id = $${params.length}`); }
  params.push(limit);
  const { rows } = await query(
    `SELECT ${PROPOSAL_COLUMNS} FROM change_proposals cp ${PROPOSAL_JOINS}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY cp.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT $${params.length}`, params);
  return rows;
}

export async function getProposal(viewer, id) {
  const { rows } = await query(`SELECT ${PROPOSAL_COLUMNS} FROM change_proposals cp ${PROPOSAL_JOINS} WHERE cp.id = $1`, [id]);
  const proposal = rows[0];
  if (!proposal) throw notFound('Proposal');
  if (!viewer.isModerator && proposal.proposer_id !== viewer.id) throw forbidden();
  const items = await query(
    `SELECT id, position, entity_type, action, target_id, temp_ref, payload, base_snapshot, result_id
     FROM change_proposal_items WHERE proposal_id = $1 ORDER BY position`, [id]);
  return { ...proposal, items: items.rows };
}

async function lockPending(db, id) {
  const { rows } = await db.query('SELECT id, proposer_id, summary, status FROM change_proposals WHERE id = $1 FOR UPDATE', [id]);
  const p = rows[0];
  if (!p) throw notFound('Proposal');
  if (p.status !== 'pending') throw conflict('proposal_not_pending', `Proposal is already ${p.status}`);
  return p;
}

export async function approveProposal(viewer, requestId, id, note) {
  return withTransaction({ userId: viewer.id, requestId, proposalId: id }, async (db) => {
    const proposal = await lockPending(db, id);
    if (proposal.proposer_id === viewer.id) throw forbidden('self_review', 'You cannot review your own proposal');

    const { rows: items } = await db.query(
      `SELECT id, position, entity_type, action, target_id, temp_ref, payload, base_snapshot
       FROM change_proposal_items WHERE proposal_id = $1 ORDER BY position`, [id]);
    const refs = {};
    for (const item of items) {
      const data = resolveRefs(item.entity_type, item.payload, refs);
      let resultId;
      if (item.action === 'create') {
        resultId = await createRecord(db, item.entity_type, data, viewer.id);
        if (item.temp_ref) refs[item.temp_ref] = resultId;
      } else {
        // Conflict detection: fields being changed must not have changed since the proposal was made.
        const current = await snapshotRecord(db, item.entity_type, item.target_id);
        const keys = item.action === 'delete' ? Object.keys(item.base_snapshot ?? {}).filter((k) => k !== 'updated_at') : Object.keys(data);
        const changed = keys.filter((k) => normalizeValue(current[k]) !== normalizeValue(item.base_snapshot?.[k]));
        if (changed.length) {
          throw conflict('proposal_conflict', 'The record changed after this proposal was made', {
            item: item.position, fields: changed,
          });
        }
        resultId = item.action === 'update'
          ? await updateRecord(db, item.entity_type, item.target_id, data, viewer.id)
          : await deleteRecord(db, item.entity_type, item.target_id);
      }
      await db.query('UPDATE change_proposal_items SET result_id = $2 WHERE id = $1', [item.id, resultId]);
    }
    await db.query(
      `UPDATE change_proposals SET status = 'approved', reviewed_by = $2, reviewed_at = now(),
              applied_at = now(), review_note = $3 WHERE id = $1`, [id, viewer.id, note ?? null]);
    await notify(db, proposal.proposer_id, {
      kind: 'proposal_approved', titleBn: `আপনার প্রস্তাব অনুমোদিত হয়েছে: ${proposal.summary}`,
      titleEn: `Your proposal was approved: ${proposal.summary}`, link: `/proposals/${id}`,
    });
    return { id, status: 'approved', created: refs };
  });
}

export async function rejectProposal(viewer, requestId, id, note) {
  return withTransaction({ userId: viewer.id, requestId }, async (db) => {
    const proposal = await lockPending(db, id);
    if (proposal.proposer_id === viewer.id) throw forbidden('self_review', 'You cannot review your own proposal');
    await db.query(
      `UPDATE change_proposals SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = $3
       WHERE id = $1`, [id, viewer.id, note ?? null]);
    await notify(db, proposal.proposer_id, {
      kind: 'proposal_rejected', titleBn: `আপনার প্রস্তাব গৃহীত হয়নি: ${proposal.summary}`,
      titleEn: `Your proposal was not accepted: ${proposal.summary}`, link: `/proposals/${id}`,
    });
    return { id, status: 'rejected' };
  });
}

export async function withdrawProposal(viewer, requestId, id) {
  return withTransaction({ userId: viewer.id, requestId }, async (db) => {
    const proposal = await lockPending(db, id);
    if (proposal.proposer_id !== viewer.id) throw forbidden();
    await db.query(`UPDATE change_proposals SET status = 'withdrawn' WHERE id = $1`, [id]);
    return { id, status: 'withdrawn' };
  });
}
