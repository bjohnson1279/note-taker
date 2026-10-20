import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildServer } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { FastifyInstance } from 'fastify';

describe('Users API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.note.deleteMany();
    await prisma.teamMember.deleteMany();
    await prisma.team.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── POST /users ─────────────────────────────────────────────────────

  it('should create a new user (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'alice@bluestaq.com', name: 'Alice' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.email).toBe('alice@bluestaq.com');
    expect(body.name).toBe('Alice');
    expect(body.id).toBeDefined();
  });

  it('should reject a duplicate email (409)', async () => {
    await prisma.user.create({ data: { email: 'dup@bluestaq.com', name: 'First' } });

    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'dup@bluestaq.com', name: 'Second' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('Conflict');
  });

  it('should reject an invalid email (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'not-an-email', name: 'Bad' },
    });

    expect(res.statusCode).toBe(400);
  });

  // ── GET /users ──────────────────────────────────────────────────────

  it('should list all users', async () => {
    await prisma.user.createMany({
      data: [
        { email: 'a@test.com', name: 'A' },
        { email: 'b@test.com', name: 'B' },
      ],
    });

    const res = await app.inject({ method: 'GET', url: '/users' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });

  // ── GET /users/:id ──────────────────────────────────────────────────

  it('should return a user with their team memberships', async () => {
    const user = await prisma.user.create({ data: { email: 'solo@test.com', name: 'Solo' } });
    const team = await prisma.team.create({ data: { name: 'Alpha Squad' } });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id } });

    const res = await app.inject({ method: 'GET', url: `/users/${user.id}` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe('solo@test.com');
    expect(body.teams).toHaveLength(1);
    expect(body.teams[0].team.name).toBe('Alpha Squad');
  });

  it('should return 404 for an unknown user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
  });
});

