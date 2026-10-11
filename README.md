# Pg Planner — PG Management SaaS

Pg Planner is a multi-tenant PG (paying guest) property-management foundation for Indian operators. The original static academic-planner prototype has been replaced with an owner dashboard backed by a React/TypeScript frontend, a REST API and PostgreSQL persistence. It is not a production-security certification.

## Included

- Responsive owner workspace with live property, room, bed and active-tenant totals; occupancy charts; recent check-ins/check-outs; and genuine zero-data onboarding states.
- Owner registration, login, logout, current-user profile, organization creation, role membership, bcrypt password hashing, server-side PostgreSQL sessions, CSRF tokens on authenticated mutations and rate-limited sign-in endpoints.
- Organization-scoped property, room, bed, tenant and occupancy APIs; property search, status filters, pagination and sorting; archive/deactivation without deleting history.
- Database relationships that prevent room/bed/occupancy records crossing organization boundaries, room/bed uniqueness and capacity constraints, exact `DECIMAL(12,2)` money, and a PostgreSQL GiST exclusion constraint that prevents overlapping active bed occupancies under concurrent requests. Money inputs are validated and transported as decimal strings (up to 10 integer digits and 2 decimal places) to preserve cents.
- Audit events, structured request IDs and safe JSON error responses, health/readiness endpoints and OpenAPI/Swagger UI.
- React Router, TanStack Query, React Hook Form, Zod, Recharts, responsive dark-blue/indigo styling, API loading/error/empty states, retry actions and CRUD forms.
- Explicit local-only development seed data. The seed script refuses to run with `NODE_ENV=production`.

The dashboard does **not** show rent collected or outstanding balances: payment records are outside this implementation scope, and fabricating those values would be misleading. Email delivery/password reset, organization invitations, reservations, billing and tenant-document storage are also not implemented.

## Stack and layout

- `apps/web`: React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod and Recharts.
- `apps/api`: Node.js, TypeScript, Express, Prisma ORM, PostgreSQL, Zod, bcryptjs, `express-session` backed by `connect-pg-simple`, Swagger UI.
- `apps/api/prisma/schema.prisma`: UUID-based multi-tenant data model.
- `apps/api/prisma/migrations`: checked-in PostgreSQL migration including database-level bed overlap and inventory-capacity guards.
- `docker-compose.yml`: local PostgreSQL 16 service.

## Requirements

- Node.js 20.19+ or 22.12+ and npm.
- PostgreSQL 14+ (local Compose is optional; Docker must be installed separately) or another PostgreSQL instance.
- A random session secret of at least 32 characters.

The application has been verified against PostgreSQL 16, including migrations, seeded sign-in, persistence, and the database integration test.

## Local setup

From the repository root:

```sh
npm install
cp .env.example .env
```

Set `SESSION_SECRET` in `.env` to a private random string (for example, generate 32 random bytes locally). The example value is a placeholder and must not be used outside local development.

Start or check PostgreSQL using either your existing local service or Docker Compose:

```sh
# Existing Homebrew PostgreSQL service (start it only if it is stopped):
brew services start postgresql@16
pg_isready

# Or use the included PostgreSQL service:
docker compose up -d postgres
```

Ensure `DATABASE_URL` in `.env` points to a database and role that exist in your setup. For a local server, create the application database if needed with `createdb pgplanner`; create the isolated `pgplanner_test` database too if you plan to run integration tests.

Then create the Prisma client, deploy migrations and optionally seed clearly labelled development data:

```sh
npm run db:generate
npm run db:migrate
NODE_ENV=development npm run db:seed
```

Start both the API and web app:

```sh
npm run dev
```

Open `http://localhost:5173`. The API listens on `http://localhost:4000`; readiness is `GET /ready`, liveness is `GET /health`, Swagger UI is `http://localhost:4000/api/docs` and the raw OpenAPI document is `http://localhost:4000/api/docs/openapi.json`.

Demo credentials (created **only** by the explicit development seed command):

```text
owner@example.test
PgPlannerLocal!2026
```

Change them before using any shared environment. Never seed production.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test` or `production`; defaults to `development`. |
| `PORT` | No | API port; defaults to `4000`. |
| `WEB_ORIGIN` | No | Allowed browser origin; defaults to `http://localhost:5173`. |
| `DATABASE_URL` | Yes for API/database commands | PostgreSQL connection string, e.g. `postgresql://pgplanner:pgplanner_dev@localhost:5432/pgplanner?schema=public`. |
| `SESSION_SECRET` | Yes for API startup | Private session-signing secret, minimum 32 characters. |
| `COOKIE_SECURE` | No | Set to `true` behind HTTPS; local default is `false`. |
| `VITE_API_BASE_URL` | No | Browser API URL; defaults to `http://localhost:4000/api/v1`. |
| `INTEGRATION_DATABASE_URL` | No | Dedicated disposable PostgreSQL database for optional database integration tests; database name must end in `_test`. |

The API validates required configuration when it starts and does not switch to mock data or an in-memory persistence fallback when PostgreSQL is unavailable.

## Developer commands

```sh
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
```

Apply migrations with `prisma migrate deploy`; there is intentionally no database-reset command in the scripts. Make and verify a PostgreSQL backup before production migrations. Backups can be made with PostgreSQL's `pg_dump` and restored with `pg_restore`; retention, encryption, off-site storage and restore drills must be configured by the operator.

### Database integration tests

Database-independent API, form and schema-constraint checks run with `npm test`. Database integration tests are opt-in, and only run when `INTEGRATION_DATABASE_URL` points at a dedicated database whose name ends in `_test`. Apply the checked-in migrations to that isolated database first; never point it at production or an unknown shared database.

```sh
DATABASE_URL="$INTEGRATION_DATABASE_URL" npm run db:migrate
INTEGRATION_DATABASE_URL="$INTEGRATION_DATABASE_URL" npm test
```

## Important implementation limits

- Sessions are stored in PostgreSQL and use HTTP-only, same-site cookies; set `COOKIE_SECURE=true` in HTTPS deployments. A single-origin deployment/reverse-proxy and secure secret management still need deployment-specific configuration.
- Password reset delivery is not active until an email provider and token-delivery workflow are configured.
- Property-manager and caretaker roles are represented in the membership model and route permission checks; invitation/role-management screens are not included.
- No payment/invoice ledger exists, so rent-collected and outstanding balances are deliberately omitted.
- Occupancy conflicts and inventory constraints are backed by PostgreSQL-specific migration SQL and must be applied before those guarantees are active.
- Review security configuration, rate limits, production cookie/CORS/CSRF policy, backups and deployment infrastructure before production use.
