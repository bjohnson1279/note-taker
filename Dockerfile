# ── Stage 1: Build & Dependencies ─────────────────────────────────────
FROM node:22-alpine AS builder

# OpenSSL and libc compatibility for Prisma query engine on Alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install dependencies (including devDependencies for build and Prisma CLI)
COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client for the Alpine musl target
RUN npx prisma generate

# Copy source and config files
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript into dist/
RUN npm run build

# ── Stage 2: Production Runner ────────────────────────────────────────
FROM node:22-alpine AS runner

# dumb-init provides signal forwarding (SIGTERM, SIGINT) and PID 1 zombie reaping
RUN apk add --no-cache openssl libc6-compat dumb-init

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy entrypoint script and set executable permissions
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Non-root user for principle of least privilege
USER node

# Copy runtime assets and dependencies
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma

EXPOSE 3000

# Container liveness check against Fastify's /health route
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
