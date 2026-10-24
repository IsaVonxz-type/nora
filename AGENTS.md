# Repository guidance

## Stack and layout

- This is not a workspace. Root `package.json` drives backend/dev commands; `frontend/package.json` drives frontend-only commands.
- Use pnpm. Both packages have their own lockfile.
- Backend app entry: `backend/app.js`; local server: `backend/dev-server.js`.
- Frontend entry: `frontend/src/main.jsx`; routes: `frontend/src/app/AppRouter.jsx`.
- API serverless wrappers delegate to `backend/app.js`; change route handlers first.

## Commands

- Full local development: `pnpm run dev`.
- Backend tests: `pnpm run test:backend`.
- Frontend tests: `pnpm --dir frontend test`.
- Lint: `pnpm run lint`.
- Frontend build: `pnpm run build:frontend`.
- Apply database migrations only to an explicitly selected database: `pnpm run db:migrate`.

## Data isolation

- Tenant memberships, not global identity roles, authorize requests.
- Operational isolation uses forced PostgreSQL RLS and transaction-local `app.tenant_id`.
- Use `backend/db/connection.js`; background work must use `runWithTenant`.
- Runtime database roles must be `NOSUPERUSER NOBYPASSRLS`; migrations use separate administrative credentials.
- The tenant-aware backend and migration `0007` require coordinated deployment.

## Frontend conventions

- CSS Modules live beside their owning component. Global CSS is reserved for tokens, fonts, resets and themes.
- Do not add remote font or stylesheet URLs. Production CSP permits self-hosted assets.
- Dialog semantics belong on the inner panel; follow existing focus-trap and validation patterns.

## Local environment

- `.env.example` documents required variables. Never commit `.env` or real credentials.
- `DATABASE_URL` and `JWT_SECRET` are required to start the backend.
- Unit tests inject isolated environment values; PostgreSQL integration tests need a disposable test database.
- Do not apply migrations or run seed scripts without verifying the target database.
