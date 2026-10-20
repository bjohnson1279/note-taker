import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildServer } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { FastifyInstance } from 'fastify';

describe('Teams API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.noteRevision.deleteMany();
    await prisma.note.deleteMany();
    await prisma.teamMember.deleteMany();
    await prisma.team.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── POST /teams ─────────────────────────────────────────────────────

  it('should create a new team (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/teams',
      payload: { name: 'Backend Crew', description: 'Builds APIs' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('Backend Crew');
    expect(body.description).toBe('Builds APIs');
  });

  it('should reject a duplicate team name (409)', async () => {
    await prisma.team.create({ data: { name: 'Unique Name' } });

    const res = await app.inject({
      method: 'POST',
      url: '/teams',
      payload: { name: 'Unique Name' },
    });

    expect(res.statusCode).toBe(409);
  });

  // ── GET /teams ──────────────────────────────────────────────────────

  it('should list teams with member and note counts', async () => {
    const team = await prisma.team.create({ data: { name: 'Counted' } });
    const user = await prisma.user.create({ data: { email: 'c@test.com', name: 'C' } });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id } });

    const res = await app.inject({ method: 'GET', url: '/teams' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body[0]._count.members).toBe(1);
    expect(body[0]._count.notes).toBe(0);
  });

  // ── GET /teams/:id ──────────────────────────────────────────────────

  it('should return team details with members', async () => {
    const team = await prisma.team.create({ data: { name: 'Detail' } });
    const user = await prisma.user.create({ data: { email: 'd@test.com', name: 'D' } });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id } });

    const res = await app.inject({ method: 'GET', url: `/teams/${team.id}` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0].user.email).toBe('d@test.com');
  });

  it('should return 404 for an unknown team', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/teams/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
  });

  // ── POST /teams/:id/members ─────────────────────────────────────────

  it('should add a user to a team (201)', async () => {
    const team = await prisma.team.create({ data: { name: 'Joinable' } });
    const user = await prisma.user.create({ data: { email: 'join@test.com', name: 'Joiner' } });

    const res = await app.inject({
      method: 'POST',
      url: `/teams/${team.id}/members`,
      payload: { userId: user.id, role: 'ADMIN' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().user.email).toBe('join@test.com');
  });

  it('should reject adding a user who is already a member (409)', async () => {
    const team = await prisma.team.create({ data: { name: 'Full' } });
    const user = await prisma.user.create({ data: { email: 'e@test.com', name: 'E' } });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id } });

    const res = await app.inject({
      method: 'POST',
      url: `/teams/${team.id}/members`,
      payload: { userId: user.id },
    });

    expect(res.statusCode).toBe(409);
  });

  it('should return 404 when the user does not exist', async () => {
    const team = await prisma.team.create({ data: { name: 'Ghost' } });

    const res = await app.inject({
      method: 'POST',
      url: `/teams/${team.id}/members`,
      payload: { userId: '00000000-0000-0000-0000-000000000000' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('User');
  });

  // ── DELETE /teams/:id/members/:userId ───────────────────────────────

  it('should remove a member from a team (204)', async () => {
    const team = await prisma.team.create({ data: { name: 'Shrinking' } });
    const user = await prisma.user.create({ data: { email: 'f@test.com', name: 'F' } });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id } });

    const res = await app.inject({
      method: 'DELETE',
      url: `/teams/${team.id}/members/${user.id}`,
    });

    expect(res.statusCode).toBe(204);
  });

  it('should return 404 when removing a non-member', async () => {
    const team = await prisma.team.create({ data: { name: 'Empty' } });

    const res = await app.inject({
      method: 'DELETE',
      url: `/teams/${team.id}/members/00000000-0000-0000-0000-000000000000`,
    });

    expect(res.statusCode).toBe(404);
  });
});

