// In-app notifications. `db` may be a transaction client so a notification is
// only created when the change it describes commits.
export async function notify(db, userId, { kind, titleBn, titleEn, link }) {
  if (!userId) return;
  await db.query(
    `INSERT INTO notifications (user_id, kind, title_bn, title_en, link) VALUES ($1, $2, $3, $4, $5)`,
    [userId, kind, titleBn, titleEn, link ?? null]);
}

export async function notifyModerators(db, payload, { exceptUserId } = {}) {
  await db.query(
    `INSERT INTO notifications (user_id, kind, title_bn, title_en, link)
     SELECT id, $1, $2, $3, $4 FROM users
     WHERE role IN ('moderator', 'admin') AND membership_status = 'verified' AND id IS DISTINCT FROM $5`,
    [payload.kind, payload.titleBn, payload.titleEn, payload.link ?? null, exceptUserId ?? null]);
}
