# Architecture

Village Digital Heritage & Community Platform: a private, bilingual (বাংলা default, English) platform for
a village's genealogy, history, directory, community and affairs.

## Repository layout

```
family-tree/
├── package.json            npm workspaces root
├── .env.example
├── database/               ✅ PostgreSQL schema, migrations, seeds, DB tests
│   ├── migrations/         plain SQL, applied in order, one transaction per file
│   ├── seeds/              FICTIONAL development data only
│   ├── scripts/            migrate.js, seed.js, lib.js
│   └── tests/              node:test suites against a throwaway *_test database
├── apps/
│   ├── api/                ✅ Express REST API (/api/v1)
│   │   └── src/
│   │       ├── config/         env parsing, Supabase admin client (server only)
│   │       ├── db/             pg pool, transaction helper (sets app.user_id etc.)
│   │       ├── middleware/     auth (Supabase JWT), requireVerified, requireRole,
│   │       │                   rate limiting, validation, error → bilingual message
│   │       ├── modules/        one folder per domain:
│   │       │   ├── people/         routes.js → controller.js → service.js → repository.js
│   │       │   ├── families/
│   │       │   ├── relationships/
│   │       │   ├── trees/          ancestor/descendant traversal → React Flow nodes/edges
│   │       │   ├── proposals/
│   │       │   ├── auth/ history/ directory/ community/ affairs/ admin/
│   │       └── app.js, server.js
│   └── web/                ✅ React + Vite + Tailwind
│       └── src/
│           ├── i18n/           bn.json (default), en.json
│           ├── api/            typed fetch client
│           ├── features/       family-tree (React Flow), people, history, directory, ...
│           ├── components/     shared UI (PersonCard, FuzzyDate, LanguageSwitch, ...)
│           └── routes/
└── docs/
    ├── architecture.md     this file
    └── database.md         schema reference, genealogy rules, error codes
```

Layering in the API: **routes** (HTTP + validation) → **controllers** (request/response
mapping) → **services** (business rules, permissions, transactions) → **repositories** (SQL).
Controllers contain no business logic and repositories contain no permission checks.

## Key decisions

| Area | Decision | Why |
|---|---|---|
| Data access | `node-postgres` + hand-written SQL in repositories, no ORM | Recursive CTEs, composite `fuzzy_date` type, partial indexes and triggers are first-class in SQL and awkward in ORMs. |
| Migrations | Plain `.sql` files + a small runner with checksums | Portable to Supabase (`supabase/migrations` uses the same format); edited-after-apply migrations are detected. |
| Database access path | Browser → Express API → PostgreSQL. The browser never queries tables directly. | Single place for authorization, auditing and privacy redaction. |
| Row Level Security | Enabled on **every** table with no policies (default deny), grants revoked from Supabase `anon`/`authenticated` | Supabase exposes `public` tables through its auto-generated REST API with the anon key; default-deny closes that path. The API connects as the table owner. |
| Auth | Supabase Auth issues JWTs; the API verifies them and loads `users` (same UUID) | No passwords handled by us; phone/email login available. |
| Files | Private Supabase Storage buckets; API issues short-lived signed URLs after a permission check | Photos of living people and documents are never publicly addressable. |
| Service-role key | Only in `apps/api` environment, never in `apps/web` | Requirement. |
| Audit | Database triggers write `audit_logs` for every change; the API sets `app.user_id`, `app.proposal_id`, `app.request_id` per transaction | Can't be bypassed by forgetting to log in application code. Log is append-only. |

## Bilingual design (বাংলা default)

* **UI strings**: i18next with `bn` as default and fallback language, `en` as the alternative.
  Language choice is stored in `users.preferred_language` (default `bn`) and in local
  storage for logged-out visitors.
* **Content**: paired columns `<field>_bn` / `<field>_en` (names, biographies, titles,
  descriptions). Only one of each pair is required; the UI shows the requested
  language and falls back to the other. The API returns both, so switching language
  needs no refetch.
* **Numbers & dates**: formatted with `Intl` using `bn-BD` (Bangla digits: ১৮৮০) or `en-GB`.
  Fuzzy dates are rendered from their parts, e.g. `আনুমানিক ১৮৮০` / `about 1880`.
  A Bangla calendar (বঙ্গাব্দ) display can be added as a formatter later without schema changes.
* **Search**: names are matched through `normalize_person_name()`, which unifies common
  Bangla spelling variants (hasant, ী/ি, ূ/ু, মোঃ/মোহাম্মদ prefixes) and works with `pg_trgm`.
* **Typography**: a Bengali-capable font (e.g. Noto Sans Bengali / Hind Siliguri) with
  line-height tuned for Bangla conjuncts.

## Roles and permissions

Global roles form a hierarchy, **member < moderator < admin** (`user_has_role(user, min_role)`):

| Role | Where stored | Can |
|---|---|---|
| Member | `users.role = member`, `membership_status = verified` | Browse the whole site and use every member feature: posting, comments, reactions, events, buy/sell, submitting genealogy change proposals. Cannot change approved records directly. |
| Moderator | `users.role = moderator` | Change everything: edit any genealogy record, approve or reject any family's proposals, moderate all content, verify or suspend members |
| Administrator | `users.role = admin` | Everything a moderator can, plus super-moderator powers: assign roles, verify, suspend or delete moderators and admins, delete accounts |

There are **no per-family roles** (no family managers or contributors). Moderators are chosen
carefully by admins and manage every family tree. The single permission check for editing
genealogy is `user_has_role(user, 'moderator')`, which admins also pass.

Unverified, rejected or suspended accounts have no member rights, whatever their role.
The database also enforces admin-only role changes and that at least one verified admin always remains (migration 0005).

## Scope

One site for one bari (decision 2026-11-24). Several villages on one site was
considered and dropped for now. Outsiders see only the name, totals and a list of
features. There is no self-registration: moderators and admins create accounts with a
username and a temporary password that must be changed at first sign-in.

## Status

Done: genealogy, proposals and review, trees, history, directory, community, village
affairs, administration, managed accounts, spreadsheet import, backups, CI and Vercel
setup (docs/LAUNCH.md), in Bangla and English.

Not done: photo/file upload screens, edit/delete screens for history and places, merging
duplicate people, attaching sources from the web app.
