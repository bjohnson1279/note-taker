import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { FastifyInstance } from 'fastify';

describe('System & Observability API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── Liveness Probe ──────────────────────────────────────────────────

  it('GET /health should return 200 with process status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  // ── Readiness Probe ─────────────────────────────────────────────────

  it('GET /health/ready should return 200 when database is connected', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ready');
    expect(body.database).toBe('connected');
    expect(body.timestamp).toBeDefined();
  });

  // ── Distributed Tracing & Correlation IDs ───────────────────────────

  it('should generate and return an X-Request-Id header on all responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    const reqId = res.headers['x-request-id'];
    expect(reqId).toBeDefined();
    expect(typeof reqId).toBe('string');
    expect((reqId as string).length).toBeGreaterThan(0);
  });

  it('should preserve and echo back incoming X-Request-Id from upstream gateway', async () => {
    const traceId = 'trace-bluestaq-gateway-12345';
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': traceId,
      },
    });

    expect(res.headers['x-request-id']).toBe(traceId);
  });
});

