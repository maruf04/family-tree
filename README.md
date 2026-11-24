# গ্রামের ডিজিটাল ঐতিহ্য · Village Digital Heritage

A private, bilingual (বাংলা default, English) platform for preserving a Bangladeshi
village's genealogy, history and community.

**Going online:** follow [docs/LAUNCH.md](docs/LAUNCH.md).
See also [docs/architecture.md](docs/architecture.md) and [docs/database.md](docs/database.md).

## Quick start

Requirements: Node.js 22, PostgreSQL 15+.

```bash
# one-time: create a role and two databases (as the postgres superuser)
sudo -u postgres psql -c "CREATE ROLE heritage LOGIN PASSWORD 'heritage'"
sudo -u postgres createdb -O heritage heritage_dev
sudo -u postgres createdb -O heritage heritage_test

cp .env.example .env
npm install
npm run db:migrate
npm run db:seed      # fictional sample families for development
npm run dev          # API on :4000 and web app on http://localhost:5173
```

Open http://localhost:5173, choose **প্রবেশ করুন**, and pick a sample user
(member, moderator or admin). This development login is refused in production.

`npm test` runs the database, API and tree-layout tests. It wipes the `*_test` database.

The sample data is **fictional** and exists only to exercise the genealogy model
(three spouses, adoption, cousin marriage, six generations…). It must never be
presented as real village history.
