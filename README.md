# Collaborative Team Note-Taking Service

A REST API backend for small teams to capture, organize, and collaborate on notes — with built-in conflict resolution via optimistic concurrency control.

Built as part of the **Bluestaq Senior Staff Software Engineer** assessment.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Runtime** | Node.js + TypeScript | Type safety end-to-end, from Prisma models to Zod request schemas |
| **Framework** | Fastify | ~3× throughput vs Express; first-class schema-based validation and serialization |
| **Validation** | Zod (`fastify-type-provider-zod`) | Single schema drives runtime validation **and** auto-generated Swagger docs — no separate OpenAPI YAML to maintain |
| **Database** | PostgreSQL 15 | ACID transactions, robust concurrency primitives, production-grade |
| **ORM** | Prisma | Type-safe queries, declarative migrations, clean relational modeling |
| **Testing** | Vitest + Fastify `.inject()` | In-process integration tests — no HTTP overhead, no port conflicts |
| **Infrastructure** | Docker Compose | One-command database provisioning |

---

## Quick Start

> **Prerequisites:** Docker (or Node.js ≥ 20 if running outside Docker).

You can run the entire stack containerized with one command, or run PostgreSQL in Docker while developing locally on your host.

### Option A: 🐳 One-Command Full Docker Stack (Recommended for Review)

No local Node.js or PostgreSQL installation required:

```bash
# 1. Clone and enter the repository
git clone https://github.com/bjohnson1279/note-taker.git
cd note-taker

# 2. Configure environment
cp .env.example .env

# 3. Build and launch PostgreSQL + API (auto-runs migrations on startup)
docker compose up --build

# 4. (Optional, in another terminal) Seed realistic demo data into the running container
docker compose exec app npm run seed
```

The API is live at **http://localhost:3000**. Interactive Swagger docs are at **http://localhost:3000/docs**.

---

### Option B: 💻 Local Node.js Development

```bash
# 1. Start only PostgreSQL via Docker
docker compose up -d postgres

# 2. Install dependencies and run migrations
npm install
npx prisma migrate dev

# 3. (Optional) Seed realistic demo data
npm run seed

# 4. Start the dev server with hot reload
npm run dev
```

The API is live at **http://localhost:3000**. Interactive Swagger docs are at **http://localhost:3000/docs**.

---

## API Reference

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/docs` | Interactive Swagger UI |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/users` | Create a user |
| `GET` | `/users` | List all users |
| `GET` | `/users/:id` | Get a user by ID (includes team memberships) |

### Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/teams` | Create a team |
| `GET` | `/teams` | List all teams (with member/note counts) |
| `GET` | `/teams/:id` | Get team details + member roster |
| `POST` | `/teams/:id/members` | Add a user to a team |
| `DELETE` | `/teams/:id/members/:userId` | Remove a user from a team |

### Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/notes` | Create a note (personal or team-shared) |
| `GET` | `/notes` | List notes (filter: `?authorId=`, `?teamId=`) |
| `GET` | `/notes/:id` | Get a note by ID |
| `PUT` | `/notes/:id` | Update a note (requires `version` for OCC) |
| `DELETE` | `/notes/:id` | Delete a note |

---

## Architecture

```
src/
├── app.ts              # Fastify app factory (plugins, routes)
├── server.ts           # Entry point — calls app factory, starts listening
├── lib/
│   └── prisma.ts       # Prisma singleton (shared across routes and tests)
├── routes/
│   ├── users.routes.ts # User CRUD handlers
│   ├── teams.routes.ts # Team + membership handlers
│   └── notes.routes.ts # Note CRUD + OCC update handler
└── schemas/
    ├── user.schemas.ts # Zod request schemas for Users
    ├── team.schemas.ts # Zod request schemas for Teams
    └── note.schemas.ts # Zod request schemas for Notes
tests/
├── users.test.ts       # User endpoint integration tests
├── teams.test.ts       # Team endpoint integration tests
└── notes.test.ts       # Note CRUD + OCC integration tests
```

**Key structural decisions:**

- **`app.ts` vs `server.ts` split** — The app factory is free of side effects, so tests can import it without starting a listener. This is the [Fastify-recommended testing pattern](https://fastify.dev/docs/latest/Guides/Testing/).
- **Schemas separated from routes** — Route files stay focused on HTTP handling; validation logic lives alongside its type definitions.
- **Flat query filters** over deeply nested REST routes (e.g. `GET /notes?teamId=X` instead of `GET /teams/:id/notes`). Simpler to extend and compose.

---

## Design Tradeoffs

### Optimistic Concurrency Control (OCC)

The `PUT /notes/:id` endpoint requires the client to send the note's current `version` number. The update is executed as a single atomic SQL statement:

```sql
UPDATE notes
SET title = COALESCE($1, title), content = COALESCE($2, content),
    version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE id = $3 AND version = $4
RETURNING ...;
```

If another user modified the note since the client last fetched it (version mismatch), zero rows are affected and the API returns `409 Conflict`.

**Why OCC over pessimistic locking?**
- No held locks → no deadlocks, no lock timeouts
- Better UX for collaborative editing — conflicts are rare when teams are small, and retry is cheap
- Stateless — no server-side lock state to manage or clean up

**Why `$queryRaw` instead of Prisma's typed API?**
Prisma's `update()` doesn't support conditional `WHERE version = X` — it only filters by the primary key. The atomic check-and-increment must be expressed in raw SQL to avoid a TOCTOU race condition.

### No Authentication Layer

User identity is passed explicitly (e.g., `authorId` in the request body) rather than extracted from a JWT or session. This is a deliberate scope decision:

- The assessment focuses on data modeling, API design, and concurrency — not auth plumbing
- Adding auth is straightforward: a Fastify `preHandler` hook would extract the user ID from a token and attach it to the request, replacing the explicit `authorId` field
- The authorization checks that _are_ present (e.g., verifying team membership before creating a shared note) demonstrate the pattern without the auth infrastructure

### UUIDs over Auto-Increment IDs

- No information leakage (can't guess or enumerate resource IDs)
- Safe for distributed systems and client-generated IDs
- Tradeoff: slightly larger storage and index overhead vs sequential integers

### Note Sharing Model

A note's `teamId` field determines its visibility:

| `teamId` | Visibility |
|-----------|------------|
| `null` | Personal — visible only via the author's `authorId` filter |
| set | Shared — visible to all members of that team |

This single-field approach keeps the schema simple. A more complex system might use a separate `note_shares` join table for per-user sharing, but for team-scoped collaboration this is sufficient.

### Production Containerization & Process Lifecycle

The Docker packaging is engineered with production operational concerns in mind:
- **Multi-stage build:** Separates the build toolchain (`builder`) from the lean runtime container (`runner`), keeping image size minimal and attack surface small.
- **Process supervision:** Uses `dumb-init` as PID 1 to ensure standard POSIX signal handling (`SIGTERM`/`SIGINT`) properly propagates to Node.js for clean teardown and prevents zombie process leaks.
- **Principle of Least Privilege:** Drops root privileges inside the container, executing the API runtime under the unprivileged `USER node`.
- **Zero-drift startup entrypoint:** `docker-entrypoint.sh` automatically runs `npx prisma migrate deploy` before serving traffic, guaranteeing schema synchronization before HTTP requests arrive.
- **Active Container Healthcheck:** Docker-native `HEALTHCHECK` queries Fastify's `/health` endpoint over IPv4 loopback (`127.0.0.1`) to integrate seamlessly with container orchestrators.

---

## Testing

Tests are integration tests that exercise the full Fastify → Prisma → PostgreSQL stack using Fastify's `.inject()` method (no real HTTP server started).

```bash
# Ensure PostgreSQL is running
docker compose up -d postgres

# Run all tests
npm test
```

**What's covered:**
- Full CRUD lifecycle for Users, Teams, and Notes
- Team membership management (add, remove, duplicate detection)
- OCC: successful update, conflict detection (409), and not-found (404)
- Validation: invalid emails, missing required fields (400)
- Authorization: non-member cannot create a team note (403)

---

## What I'd Add Given More Time

- **Authentication & authorization middleware** — JWT-based auth with role-based access control
- **Pagination** — Cursor-based pagination for list endpoints to handle large datasets
- **Full-text search** — PostgreSQL `tsvector` search on note title and content
- **Soft deletes** — `deletedAt` timestamp instead of hard deletes, with restore capability
- **Rate limiting** — `@fastify/rate-limit` to protect against abuse
- **Request ID tracing** — Correlation IDs propagated through logs for observability
- **CI pipeline** — GitHub Actions for lint, typecheck, and test on every PR

