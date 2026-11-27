// Moderator/admin direct edits of genealogy records (members use proposals).
import { tx } from '../../db.js';
import { badRequest } from '../../errors.js';
import { ENTITIES, createRecord, deleteRecord, parsePayload, updateRecord } from './writer.js';

export async function directCreate(req, entity, payload) {
  const data = parsePayload(entity, 'create', payload, { isModerator: true });
  const isTempRef = ([name, v]) => ENTITIES[entity].fields[name].kind === 'ref' && typeof v === 'string' && v.startsWith('$');
  if (Object.entries(data).some(isTempRef)) {
    throw badRequest('unknown_reference', 'Temporary references are only allowed inside proposals');
  }
  return tx(req, (db) => createRecord(db, entity, data, req.viewer.id));
}

export async function directUpdate(req, entity, id, payload) {
  const data = parsePayload(entity, 'update', payload, { isModerator: true });
  return tx(req, (db) => updateRecord(db, entity, id, data, req.viewer.id));
}

export async function directDelete(req, entity, id) {
  return tx(req, (db) => deleteRecord(db, entity, id));
}
