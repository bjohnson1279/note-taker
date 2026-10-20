# Collaborative Team Note-Taking Service

A robust, production-grade REST backend built for small teams to capture, share, and collaborate on notes with built-in conflict resolution and strict schema validation.

## 🚀 Tech Stack
* **Runtime & Framework:** Node.js, TypeScript, **Fastify** (chosen for high-throughput performance and native Zod schema validation)
* **Database & ORM:** PostgreSQL, **Prisma** (for type-safe migrations and clean relational modeling)
* **Validation & Types:** Zod (runtime validation + automatic TypeScript inference)
* **Testing:** Vitest (end-to-end integration testing via Fastify `.inject()`)
* **Infrastructure:** Docker & Docker Compose

---

## 🛠️ Quick Start (Getting Up and Running)

Ensure you have **Node.js (v18+)** and **Docker** installed.

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/bjohnson1279/note-taker.git](https://github.com/bjohnson1279/note-taker.git)
   cd note-taker

2. Configure environment variables:

```
cp .env.example .env
```

3. Spin up PostgreSQL via Docker:

```
docker compose up -d
```

4. Install dependencies and run database migrations:

```
npm install
npx prisma migrate dev
```

5. Start the development server:

```
npm run dev
The API will be live at http://localhost:3000. Interactive Swagger documentation is available at http://localhost:3000/docs.
```
