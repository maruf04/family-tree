// Members sign in with a username; Supabase needs an email, so a username maps
// to an internal address. Must match apps/api/src/lib/authAdmin.js.
export const USERNAME_DOMAIN = 'members.bari.internal';
export const loginEmail = (input) => {
  const value = input.trim().toLowerCase();
  return value.includes('@') ? value : `${value}@${USERNAME_DOMAIN}`;
};
