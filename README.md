# NoticeBoard

A working community notice board built with Next.js, Prisma, and PostgreSQL.

## Run locally

Requires Node.js 18.18 or newer and a PostgreSQL database.

1. Copy `.env.example` to `.env`; set your PostgreSQL `DATABASE_URL` and a private `AUTH_SECRET` of at least 32 characters.
2. Install packages and apply the database migration:
   ```bash
   npm install
   npm run db:deploy
   npm run dev
   ```
3. Open http://localhost:3000 and create an account.

## What works

- Account registration and sign-in with scrypt password hashes and HTTP-only signed session cookies.
- Community creation; the creator becomes its admin.
- Seven-day invite links for joining communities.
- Persistent notices, search, and per-member acknowledgements.
- Server-side membership checks on community and notice routes.

The Prisma schema and initial migration are configured for PostgreSQL. Set a strong, unique `AUTH_SECRET` in every environment. This MVP does not yet include email verification, password reset, attachment storage, or automated account recovery.

## Hosting

The included `render.yaml` describes a Render web service and PostgreSQL database. Render's free PostgreSQL plan is for temporary previews: it expires after 30 days and has no backups. Use a paid database plan for persistent production data.
