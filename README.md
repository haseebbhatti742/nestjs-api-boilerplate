# nestjs-api-boilerplate

A production-ready NestJS REST API boilerplate — JWT auth (access + refresh tokens), RBAC, PostgreSQL/TypeORM, Swagger docs, Docker, and GitHub Actions CI out of the box.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | NestJS 10 |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL 15 |
| ORM | TypeORM |
| Auth | JWT (access + refresh tokens) |
| Validation | class-validator + class-transformer |
| API Docs | Swagger / OpenAPI 3.0 |
| Containerisation | Docker + docker-compose |
| CI/CD | GitHub Actions |
| Testing | Jest + Supertest |
| Package manager | pnpm |

## Getting Started

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Docker (for local Postgres, or run the full stack in containers)

### Setup

```bash
# Install dependencies
pnpm install

# Copy env file and fill in real secrets
cp .env.example .env

# Start Postgres
docker-compose up -d postgres

# Run migrations
pnpm run migration:run

# Start the dev server (hot reload)
pnpm run start:dev
```

The API is now running at `http://localhost:3000`, with interactive Swagger docs at `http://localhost:3000/api/docs`.

> If you already have a local Postgres instance listening on 5432, set `DB_PORT` in `.env` to a free port (e.g. `5433`) — `docker-compose.yml` maps the container to whatever `DB_PORT` you set.

### Running the full stack in Docker

```bash
docker-compose up --build
```

This builds and starts both the `postgres` and `app` services. The app container hot-reloads on file changes via a bind mount.

## Environment Variables

All variables are documented in [`.env.example`](.env.example). Never commit `.env`.

```env
# App
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nestjs_boilerplate
DB_USER=postgres
DB_PASSWORD=postgres

# JWT
JWT_ACCESS_SECRET=your-access-secret-here
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_REFRESH_EXPIRY=7d

# CORS
CORS_ORIGIN=http://localhost:3000
```

Generate strong random secrets for `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, e.g.:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## API Endpoints

Full interactive documentation is available at `/api/docs` (Swagger UI) once the server is running.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a new user |
| POST | `/auth/login` | Public | Log in — returns an access token, sets an httpOnly refresh cookie |
| POST | `/auth/refresh` | Refresh cookie | Issue a new access token |
| POST | `/auth/logout` | Bearer | Clear the refresh cookie |
| GET | `/auth/me` | Bearer | Current authenticated user |

### Users

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/users` | Bearer | admin | List all users (paginated) |
| GET | `/users/:id` | Bearer | admin or self | Get a user by ID |
| PATCH | `/users/:id` | Bearer | admin or self | Update a user (roles cannot be self-assigned) |
| DELETE | `/users/:id` | Bearer | admin | Soft-delete a user |

All successful responses are wrapped as:

```json
{ "data": { ... }, "statusCode": 200, "timestamp": "2026-08-04T12:00:00.000Z" }
```

Errors follow the shape:

```json
{ "statusCode": 404, "message": "User not found", "timestamp": "2026-08-04T12:00:00.000Z", "path": "/users/999" }
```

## Auth Model

- **Access token**: 15 minutes, sent via `Authorization: Bearer <token>`.
- **Refresh token**: 7 days, stored in an httpOnly, `sameSite: strict` cookie scoped to `/auth`. `POST /auth/refresh` reads the cookie and issues a new access token (and rotates the refresh token).
- **Logout** only clears the cookie client-side. There is **no server-side revocation** — a refresh token captured before logout remains valid until it naturally expires. Adding a Redis (or DB-backed) token blacklist is an intentional TODO (see below); until then, keep the refresh token lifetime short and always serve over HTTPS in production.
- **RBAC**: roles live on the `User` entity as an array (`['user']` or `['admin']`). Endpoints are protected with `@Roles('admin')` + the global `RolesGuard`; self-vs-admin access on `/users/:id` is enforced in `UsersService`, not via a role decorator.

## Database Migrations

`synchronize` is enabled only in non-production environments; production and CI always run committed migrations.

```bash
# Generate a migration from entity changes
pnpm run migration:generate -- src/database/migrations/DescriptiveName

# Apply pending migrations
pnpm run migration:run

# Revert the last migration
pnpm run migration:revert
```

## Testing

```bash
# Unit tests
pnpm run test

# Watch mode
pnpm run test:watch

# Coverage
pnpm run test:cov

# End-to-end tests (requires a running Postgres — see docker-compose up -d postgres)
pnpm run test:e2e
```

## Linting & Formatting

```bash
pnpm run lint     # ESLint, auto-fix
pnpm run format   # Prettier
```

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`:

1. Install dependencies, run ESLint, run unit tests, run the build (`tsc` compile check).
2. A separate job spins up a PostgreSQL service container, runs migrations, and runs the e2e suite.

## Project Structure

```
src/
├── app.module.ts              # Root module
├── main.ts                    # Bootstrap: Swagger, validation, CORS, cookies
├── config/                    # Env-driven config (app, database, jwt)
├── database/                  # TypeORM module, CLI data source, migrations
├── common/                    # Guards, decorators, filters, interceptors, pipes
├── auth/                      # Register/login/refresh/logout/me
└── users/                     # User CRUD, entity, DTOs
test/
├── auth.e2e-spec.ts
└── users.e2e-spec.ts
```

See [`CLAUDE.md`](CLAUDE.md) for full architecture notes, conventions, and design rationale.

## Known TODOs

These are intentionally out of scope for the boilerplate but are common next steps:

- Redis token blacklist (server-side refresh token revocation)
- Email verification
- Password reset flow
- Rate limiting on auth endpoints (`@nestjs/throttler`)
- File upload (Multer + S3)
- Audit logging
- Multi-tenancy
- Helmet security headers

## License

[MIT](LICENSE)
