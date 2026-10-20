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
| `POST` | `/notes` | Create a note (personal or team-shared; supports `tags`) |
| `GET` | `/notes` | List & search notes (`?authorId=`, `?teamId=`, `?tag=`, `?q=`, `?cursor=`, `?limit=`) |
| `GET` | `/notes/:id` | Get a note by ID |
| `GET` | `/notes/:id/history` | Get immutable revision audit trail for a note |
| `PUT` | `/notes/:id` | Update a note (OCC versioning + captures revision snapshot) |
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

### Keyset (Cursor-based) Pagination vs. Offset Pagination

The `GET /notes` endpoint implements keyset cursor pagination rather than classic `OFFSET/LIMIT`:
- **Performance at scale:** `OFFSET N` forces the database engine to scan and discard $N$ rows before returning results, degrading query latency from $O(1)$ to $O(N)$ as page numbers increase. Keyset pagination utilizes the indexed `createdAt` / `id` boundary to jump directly to target tuples in $O(1)$ constant time.
- **Consistency under concurrent mutations:** In high-write collaborative apps, if notes are inserted or deleted while a client navigates pages, offset pagination produces duplicate rows or skipped records ("page drift"). Keyset pagination guarantees that every note is returned exactly once.
- **Pre-flight count avoidance:** The query requests `limit + 1` records; if an extra record is returned, `hasMore: true` and `nextCursor` are populated without issuing an expensive full-table `COUNT(*)` scan.

### Full-Text Keyword Search (`?q=`)

The `GET /notes?q=...` endpoint performs case-insensitive search across both note `title` and `content`.
- Matches words or partial terms in titles and markdown bodies.
- Composable with other query scopes (`?teamId=...&q=architecture`).
- Returns full author and team relationship metadata in the paginated envelope.

### Immutable Revision History & Collaborative Audit Log

Rather than merely incrementing an integer counter for Optimistic Concurrency Control, the API synergizes OCC with full audit tracking:
- **Zero-drift snapshot creation:** When `PUT /notes/:id` updates a note from version $N$ to $N+1$, the update and the insertion of version $N$ into `note_revisions` occur inside a single atomic database transaction (`prisma.$transaction`).
- **Audit trail retrieval (`GET /notes/:id/history`):** Returns the chronological history of all prior snapshots, complete with editor attribution (`editorId`), previous title, content, tags, and timestamp.
- **Enterprise resilience:** Enables future features such as revision rollbacks, point-in-time diffing, and forensic auditability in collaborative team workflows.

### Tags & Native PostgreSQL Array Operations

Notes support flexible classification via a `tags` array:
- Uses PostgreSQL's native `TEXT[]` array type rather than an expensive relational join table (`note_tags`).
- Queries with `?tag=security` leverage PostgreSQL's containment operator (`@>`) via Prisma's `{ tags: { has: tag } }` for efficient filtering.

### Production Hardening & Operational Resilience

- **Rate Limiting (`@fastify/rate-limit`):** Protects endpoints from volumetric DoS and automated brute-force attacks (100 req/min default, configurable via environment, relaxed in test suites).
- **CORS (`@fastify/cors`):** Pre-configured cross-origin headers to support single-page web applications and mobile API consumers.
- **Graceful Shutdown:** Intercepts `SIGINT` (Ctrl+C) and `SIGTERM` (Docker / Kubernetes container termination signals) to:
  1. Stop accepting new HTTP connections.
  2. Allow in-flight requests to finish processing.
  3. Cleanly drain and disconnect Prisma's PostgreSQL connection pool.
  4. Terminate with exit code 0 without abruptly severing active transactions.

### Automated CI/CD Workflow (`.github/workflows/ci.yml`)

A production GitHub Actions workflow runs on every push and pull request to `main`:
- Spins up a dedicated PostgreSQL 15 service container with health checks.
- Enforces strict TypeScript typechecking (`npm run typecheck`).
- Deploys migrations via `prisma migrate deploy`.
- Executes the full Vitest integration test suite.
- Builds the multi-stage production Docker image to guarantee container build reproducibility.

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

**What's covered (34 automated integration tests):**
- Full CRUD lifecycle for Users, Teams, and Notes
- Team membership management (add, remove, duplicate detection)
- OCC: successful update, conflict detection (409), and not-found (404)
- Immutable revision history tracking and history endpoint (`GET /notes/:id/history`)
- Tagging and PostgreSQL array filtering (`?tag=...`)
- Keyword search across note titles and content (`?q=...`)
- Keyset cursor pagination with `limit`, `cursor`, `hasMore`, and `nextCursor`
- Validation: invalid emails, missing required fields (400)
- Authorization: non-member cannot create a team note (403)

---

## What I'd Add Given More Time

- **Authentication & authorization middleware** — JWT-based auth with role-based access control (RBAC)
- **Soft deletes** — `deletedAt` timestamp instead of hard deletes, with restore capability
- **WebSockets / Server-Sent Events (SSE)** — Real-time live updates when a teammate updates a shared note

