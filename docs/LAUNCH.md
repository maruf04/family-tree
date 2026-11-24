# Putting the site online

GitHub keeps the code, **Vercel** runs the site (free, updates on every push) and
**Supabase** keeps the data, logins and files. GitHub Pages cannot run this site:
it serves plain files only, and the privacy checks need a server.

Real family data never goes into GitHub. It goes from your spreadsheet straight
into Supabase through the website.

## 1. GitHub repository

Already private: <https://github.com/maruf04/family-tree>. Keep it that way.

## 2. Create the tables in Supabase

1. Supabase → your project → **Connect** (top) → **Session pooler** (port **5432**). Copy the string.
2. In `.env` add it, with your database password in place of `[YOUR-PASSWORD]`:
   `PRODUCTION_DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-...pooler.supabase.com:5432/postgres`
   (Forgot the password? Use **Reset database password**. Choose letters and digits only.)
3. Run:

```bash
npm run prod:migrate
npm run prod:make-admin -- yourusername "আপনার নাম"
```

The second command prints a temporary password once. Use your email instead of a
username to keep using the login you already have.

## 3. Close public sign-up

Supabase → **Authentication** → sign-in settings → turn off **Allow new users to sign up**.
Admins can still create accounts from the website.

## 4. Deploy on Vercel

1. Push the code to GitHub (`main`).
2. <https://vercel.com> → sign in **with GitHub** → **Add New → Project** → import `family-tree`.
   Leave the build settings as they are; they come from `vercel.json`.
3. Under **Environment Variables** add:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (port **6543**), with your password |
| `SUPABASE_URL` | same as in `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | same as in `.env` (secret) |
| `VITE_SUPABASE_URL` | same as in `.env` |
| `VITE_SUPABASE_ANON_KEY` | same as in `.env` |

4. **Deploy**. Then **Settings → Functions → Region**: choose the one nearest your Supabase
   region (it is in the connection string, e.g. `ap-southeast-1` = Singapore) and redeploy.
   A far region makes every page slow.
5. Open `https://<your-site>.vercel.app/api/health`. It must show `{"ok":true}`.
6. Supabase → Authentication → URL Configuration → **Site URL** = your site's address.

## 5. Fill it

1. Sign in, change the temporary password.
2. Home page → **বাড়ির তথ্য সম্পাদনা**: name, village, union, upazila, district.
3. **প্রশাসন → ডেটা আপলোড**: download the two forms, fill them in, check, save.
4. **প্রশাসন → ব্যবহারকারী → নতুন সদস্যের অ্যাকাউন্ট**: give each person their username and
   temporary password. They must change it at first sign-in.

Create real accounts only on the live site: the local copy shares the same Supabase logins.

## Keeping it safe

* **Back up** after every large change, and monthly: `npm run backup`. Copy the file from
  `backups/` somewhere private. Free Supabase has no automatic backups. Uploaded files and
  passwords are not in this backup.
* **Restore** into a new, empty database:
  `psql "$URL" -c "create extension if not exists pg_trgm" -c "create extension if not exists citext"`, then
  `pg_restore --no-owner -d "$URL" backups/<file>.dump`. One message, `schema "public" already exists`, is
  normal. In a new Supabase project the logins must be created again.
* **Pausing:** free Supabase pauses a project after 1 week without use. Open it in the
  Supabase dashboard and press restore; nothing is lost.
* **Updating:** run `npm run prod:migrate` before pushing code that adds a migration.
