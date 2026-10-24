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

## Application and data

- Nora is a single installation with user roles stored in `usuarios.rol`.
- Use `backend/db/connection.js` for database access.
- Preserve atomic reservation transactions and session-version revocation.
- Use a dedicated database. Do not connect this version to a database with the former multi-organization schema without a separately reviewed conversion.

## Frontend conventions

- CSS Modules live beside their owning component. Global CSS is reserved for tokens, fonts, resets and themes.
- Do not add remote font or stylesheet URLs. Production CSP permits self-hosted assets.
- Dialog semantics belong on the inner panel; follow existing focus-trap and validation patterns.

## Local environment

- `.env.example` documents required variables. Never commit `.env` or real credentials.
- `DATABASE_URL` and `JWT_SECRET` are required to start the backend.
- Unit tests inject isolated environment values; PostgreSQL integration tests need a disposable test database.
- Do not apply migrations or run seed scripts without verifying the target database.
