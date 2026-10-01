# NoticeBoard

A working community notice board built with Next.js, Prisma, and SQLite.

## Run locally

Requires Node.js 18.18 or newer.

1. Copy `.env.example` to `.env` and set a private `AUTH_SECRET` of at least 32 characters.
2. Install packages and create the local database:
   ```bash
   npm install
   npm run db:migrate -- --name init
   npm run dev
   ```
3. Open http://localhost:3000 and create an account.

## What works

- Account registration and sign-in with scrypt password hashes and HTTP-only signed session cookies.
- Community creation; the creator becomes its admin.
- Seven-day invite links for joining communities.
- Persistent notices, search, and per-member acknowledgements.
- Server-side membership checks on community and notice routes.

Data is stored in `prisma/dev.db` for local development. Back up this file to keep the local database. Before deploying to a serverless host or running multiple app instances, switch the Prisma datasource to PostgreSQL and configure a managed database. Set a strong, unique `AUTH_SECRET` in every environment. This MVP does not yet include email verification, password reset, attachment storage, or automated account recovery.
