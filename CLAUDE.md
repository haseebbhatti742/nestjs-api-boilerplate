# CLAUDE.md — NestJS API Boilerplate

This file describes the architecture, design decisions, and development patterns for this project. It is intended for AI coding assistants (Claude Code, Cursor, Copilot) and human engineers onboarding to the codebase.

---

## Project Overview

A production-ready NestJS REST API boilerplate with JWT authentication, role-based access control, PostgreSQL via TypeORM, Swagger documentation, Docker support, and GitHub Actions CI/CD.

**Purpose:** A reusable foundation for building secure, scalable Node.js backend services without starting from scratch every time.

---

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
| Linting | ESLint + Prettier |

---

## Project Structure

```
nestjs-api-boilerplate/
├── src/
│   ├── app.module.ts              # Root module — imports all feature modules
│   ├── main.ts                    # Bootstrap: Swagger, validation pipe, CORS
│   │
│   ├── config/                    # Environment configuration
│   │   ├── app.config.ts          # App-level config (port, env)
│   │   ├── database.config.ts     # PostgreSQL connection config
│   │   └── jwt.config.ts          # JWT secret, expiry config
│   │
│   ├── database/                  # Database setup
│   │   ├── database.module.ts     # TypeORM async config module
│   │   └── migrations/            # TypeORM migration files
│   │
│   ├── common/                    # Shared utilities
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts   # @CurrentUser() param decorator
│   │   │   └── roles.decorator.ts          # @Roles() metadata decorator
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts           # Global JWT guard
│   │   │   └── roles.guard.ts             # RBAC guard
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts   # Global exception filter
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts   # Wrap all responses in { data, meta }
│   │   ├── pipes/
│   │   │   └── validation.pipe.ts         # Global validation pipe config
│   │   └── types/
│   │       └── express.d.ts               # Augment Express Request with user
│   │
│   ├── auth/                      # Authentication module
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts     # POST /auth/register, /auth/login, /auth/refresh, /auth/logout
│   │   ├── auth.service.ts        # Business logic for auth flows
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts    # Passport JWT strategy (access token)
│   │   │   └── jwt-refresh.strategy.ts  # Passport JWT strategy (refresh token)
│   │   └── dto/
│   │       ├── register.dto.ts
│   │       ├── login.dto.ts
│   │       └── tokens.dto.ts
│   │
│   └── users/                     # Users module
│       ├── users.module.ts
│       ├── users.controller.ts    # GET /users, GET /users/:id, PATCH /users/:id, DELETE /users/:id
│       ├── users.service.ts
│       ├── entities/
│       │   └── user.entity.ts     # TypeORM entity with soft delete
│       └── dto/
│           ├── create-user.dto.ts
│           └── update-user.dto.ts
│
├── test/
│   ├── auth.e2e-spec.ts           # End-to-end auth flow tests
│   └── users.e2e-spec.ts
│
├── docker-compose.yml             # PostgreSQL + API services
├── Dockerfile                     # Multi-stage build (dev + prod)
├── .env.example                   # All required env vars with comments
├── .github/
│   └── workflows/
│       └── ci.yml                 # Lint, test, build on push/PR
├── CLAUDE.md                      # This file
└── README.md
```

---

## Architecture Decisions

### Why NestJS?
NestJS enforces module boundaries, dependency injection, and separation of concerns out of the box. For a boilerplate that needs to be extended by teams, this opinionated structure prevents the codebase from degrading into a flat mess of files over time.

### Why TypeORM over Prisma?
TypeORM integrates natively with NestJS decorators and is more flexible for migration-heavy workflows. Prisma is an excellent alternative — a Prisma branch exists at `feat/prisma` if you prefer it.

### JWT Strategy: Access + Refresh Tokens
- **Access token:** short-lived (15 minutes), sent in `Authorization: Bearer` header
- **Refresh token:** long-lived (7 days), stored in httpOnly cookie
- **Why httpOnly cookie for refresh:** prevents JavaScript access, mitigates XSS token theft
- **Refresh flow:** POST `/auth/refresh` reads the cookie, validates the token, issues a new access token
- **Logout:** clears the refresh token cookie and optionally blacklists the token (Redis blacklist is a TODO — see below)

### Role-Based Access Control (RBAC)
Roles are stored on the User entity as an enum array (`['user', 'admin']`). The `@Roles()` decorator marks endpoints, and `RolesGuard` checks the authenticated user's roles against the required ones. The guard is applied globally but skipped if no `@Roles()` metadata is present.

```typescript
// Example usage
@Get('admin-only')
@Roles('admin')
getAdminData() { ... }
```

### Global Response Shape
All responses are wrapped by `TransformInterceptor`:
```json
{
  "data": { ... },
  "statusCode": 200,
  "timestamp": "2026-08-04T12:00:00.000Z"
}
```
Errors use the global `HttpExceptionFilter`:
```json
{
  "statusCode": 404,
  "message": "User not found",
  "timestamp": "2026-08-04T12:00:00.000Z",
  "path": "/users/999"
}
```

### Validation
`class-validator` DTOs with `ValidationPipe` set globally:
- `whitelist: true` — strips unknown properties
- `forbidNonWhitelisted: true` — throws on unknown properties
- `transform: true` — auto-transforms payloads to DTO class instances

### Soft Deletes
Users are soft-deleted by default (TypeORM `@DeleteDateColumn`). Hard delete is available but not exposed via API. This prevents data loss from accidental deletions and supports audit trails.

### Database Migrations
TypeORM migrations are used (not `synchronize: true` in production). Migration commands:
```bash
npm run migration:generate -- src/database/migrations/MigrationName
npm run migration:run
npm run migration:revert
```
`synchronize: true` is enabled in development only via environment config.

---

## Environment Variables

All variables are documented in `.env.example`:

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

Never commit `.env`. Always use `.env.example` as the template.

---

## API Endpoints

All endpoints are documented at `/api/docs` via Swagger UI.

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register new user |
| POST | `/auth/login` | Public | Login, returns access token + sets refresh cookie |
| POST | `/auth/refresh` | Cookie | Refresh access token |
| POST | `/auth/logout` | Bearer | Clear refresh cookie |
| GET | `/auth/me` | Bearer | Current authenticated user |

### Users
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/users` | Bearer | admin | List all users (paginated) |
| GET | `/users/:id` | Bearer | admin / self | Get user by ID |
| PATCH | `/users/:id` | Bearer | admin / self | Update user |
| DELETE | `/users/:id` | Bearer | admin | Soft delete user |

---

## Running the Project

### Development
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Install dependencies
npm install

# Copy env
cp .env.example .env

# Run migrations
npm run migration:run

# Start dev server (hot reload)
npm run start:dev
```

### Docker (full stack)
```bash
docker-compose up --build
```
Starts both the API and PostgreSQL. API available at `http://localhost:3000`.

### Tests
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

---

## CI/CD (GitHub Actions)

On every push and pull request to `main`:
1. Install dependencies
2. Run ESLint
3. Run unit tests
4. Run build (`tsc` compile check)

E2E tests run against a PostgreSQL service container spun up by the workflow.

---

## Known TODOs / Extension Points

These are intentionally left out of the boilerplate but are common next steps:

- **Redis token blacklist** — invalidate refresh tokens on logout server-side
- **Email verification** — send verification email on register
- **Password reset flow** — forgot password + reset via token
- **Rate limiting** — `@nestjs/throttler` for brute-force protection on auth endpoints
- **File upload** — `@nestjs/platform-express` + Multer + S3 integration
- **Pagination helper** — generic paginate utility using TypeORM `findAndCount`
- **Audit logging** — log all write operations with user + timestamp
- **Multi-tenancy** — row-level security pattern on top of this base

---

## Coding Conventions

- **One module per feature** — never import across feature boundaries without going through the module export
- **DTOs for all input** — never use raw `body` objects in controllers
- **Services own business logic** — controllers only handle HTTP concerns (extract params, call service, return response)
- **No `any`** — TypeScript strict mode is enabled; suppress warnings only with explicit justification in a comment
- **Error handling** — throw `HttpException` subclasses from services; never send raw error messages to the client
- **Naming:** `camelCase` for variables/functions, `PascalCase` for classes/interfaces, `SCREAMING_SNAKE_CASE` for constants

---

## Security Checklist

- [x] Passwords hashed with bcrypt (cost factor 12)
- [x] JWT secrets loaded from environment, never hardcoded
- [x] Refresh token in httpOnly cookie
- [x] Input validation and whitelist on all endpoints
- [x] CORS restricted to `CORS_ORIGIN` env var
- [x] Soft delete (no accidental data loss)
- [ ] Rate limiting on auth endpoints (TODO)
- [ ] Redis token blacklist on logout (TODO)
- [ ] Helmet headers (TODO — add `helmet` middleware in `main.ts`)
