# NoticeBoard

NoticeBoard is a responsive community notice board focused on clear updates and accountable actions — not chat.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Current MVP

The current experience is a polished front-end prototype with seeded community and notice data. It demonstrates community switching, search and filters, notice creation, acknowledgement state, invite-link UI, responsive navigation, empty states, and toast feedback. Data is held in component state for the prototype.

## Next production steps

Connect the existing flows to a PostgreSQL/Prisma data layer, Auth.js sessions, object storage for attachments, and server-side authorization checks. The UI is intentionally structured around those future boundaries.
