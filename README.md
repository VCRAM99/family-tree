# Family Tree

A private family archive. This repository is the foundation: accounts, trees, the data model, and settings. The tree canvas, person cards, public viewer, and opening animation come later.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` if you do not already have one, and fill in the values below.
3. Apply migrations to your Neon **development** branch: `npm run db:migrate`
4. Start the app: `npm run dev`
5. Create an account at [http://localhost:3000](http://localhost:3000). Until `RESEND_API_KEY` is set, the verification link is printed in the server console.

## Environment

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | The app at runtime | Pooled Neon connection. The host name includes `-pooler`. |
| `DATABASE_URL_UNPOOLED` | `drizzle-kit` only | Direct Neon connection for migrations and Drizzle Studio. Do not point the app at this URL. |
| `BETTER_AUTH_SECRET` | Better Auth | Long random secret. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Better Auth | Public origin, `http://localhost:3000` in development. |
| `RESEND_API_KEY` | Email | Optional. When empty, mail is logged instead of sent. |
| `EMAIL_FROM` | Email | Required when Resend is configured. |

## Migrations

Schema lives in `lib/db/schema.ts` (Better Auth tables are generated into `lib/db/auth-schema.ts`). SQL migrations are committed in `drizzle/`.

- `npm run db:generate` writes a migration from the Drizzle schema.
- `npm run db:migrate` applies pending migrations with `drizzle-kit`, using `DATABASE_URL_UNPOOLED`.
- `npm run db:studio` opens Drizzle Studio against that same direct connection.
- Relationship rules that Drizzle cannot express (the ancestry-cycle trigger, and same-tree checks) are custom SQL in `drizzle/0001_integrity_triggers.sql`. Generate an empty file with `npx drizzle-kit generate --custom --name your_name` before editing it.

`npm test` applies those same files to PGlite, so the triggers are exercised without Neon.

## Neon branches

Use a Neon **development** branch for local work. Put that branch’s pooled URL in `DATABASE_URL` and its direct URL in `DATABASE_URL_UNPOOLED`. Apply migrations there first.

The **main** branch is production. Point the hosted app at main, and run `npm run db:migrate` against main only when you intend to release a schema change. Do not point `.env.local` at main.

## Scripts

`dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:studio`.
