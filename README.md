# গ্রামের ডিজিটাল ঐতিহ্য · Village Digital Heritage

A private, bilingual (বাংলা default, English) platform for preserving a Bangladeshi
village's genealogy, history and community.

**Status:** milestone 1 of 12, covering the PostgreSQL genealogy schema with tests.
See [docs/architecture.md](docs/architecture.md) for the full plan and
[docs/database.md](docs/database.md) for the schema reference.

## Quick start (database)

Requirements: Node.js 20+, PostgreSQL 15+.

```bash
# one-time: create a role and two databases (as the postgres superuser)
sudo -u postgres psql -c "CREATE ROLE heritage LOGIN PASSWORD 'heritage'"
sudo -u postgres createdb -O heritage heritage_dev
sudo -u postgres createdb -O heritage heritage_test

cp .env.example .env
npm install
npm run db:migrate
npm run db:seed      # fictional sample families for development
npm run db:test
```

The sample data is **fictional** and exists only to exercise the genealogy model
(three spouses, adoption, cousin marriage, six generations…). It must never be
presented as real village history.
