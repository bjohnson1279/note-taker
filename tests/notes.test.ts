import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildServer } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { FastifyInstance } from 'fastify';

describe('Notes API', () => {
  let app: FastifyInstance;
  let userId: string;
  let teamId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.note.deleteMany();
    await prisma.teamMember.deleteMany();
    await prisma.team.deleteMany();
    await prisma.user.deleteMany();

    // Seed common fixtures: one user and one team with the user as a member
    const user = await prisma.user.create({
      data: { email: 'author@bluestaq.com', name: 'Author' },
    });
    userId = user.id;

    const team = await prisma.team.create({ data: { name: 'Engineering' } });
    teamId = team.id;

    await prisma.teamMember.create({ data: { teamId, userId } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── POST /notes ─────────────────────────────────────────────────────

  it('should create a personal note (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      payload: { title: 'My Note', content: 'Private thoughts', authorId: userId },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe('My Note');
    expect(body.teamId).toBeNull();
    expect(body.version).toBe(1);
  });

  it('should create a team-shared note (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      payload: { title: 'Shared Note', authorId: userId, teamId },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().teamId).toBe(teamId);
  });

  it('should reject creating a team note if the author is not a member (403)', async () => {
    const outsider = await prisma.user.create({
      data: { email: 'outsider@test.com', name: 'Outsider' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      payload: { title: 'Sneaky', authorId: outsider.id, teamId },
    });

    expect(res.statusCode).toBe(403);
  });

  it('should return 404 if the author does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      payload: {
        title: 'Orphan',
        authorId: '00000000-0000-0000-0000-000000000000',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  // ── GET /notes ──────────────────────────────────────────────────────

  it('should list all notes', async () => {
    await prisma.note.createMany({
      data: [
        { title: 'A', authorId: userId },
        { title: 'B', authorId: userId, teamId },
      ],
    });

    const res = await app.inject({ method: 'GET', url: '/notes' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });

  it('should filter notes by authorId', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@test.com', name: 'Other' },
    });
    await prisma.teamMember.create({ data: { teamId, userId: other.id } });

    await prisma.note.create({ data: { title: 'Mine', authorId: userId } });
    await prisma.note.create({ data: { title: 'Theirs', authorId: other.id } });

    const res = await app.inject({
      method: 'GET',
      url: `/notes?authorId=${userId}`,
    });

    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].title).toBe('Mine');
  });

  it('should filter notes by teamId', async () => {
    await prisma.note.create({ data: { title: 'Personal', authorId: userId } });
    await prisma.note.create({
      data: { title: 'Team', authorId: userId, teamId },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/notes?teamId=${teamId}`,
    });

    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].title).toBe('Team');
  });

  // ── GET /notes/:id ──────────────────────────────────────────────────

  it('should return a single note with author and team info', async () => {
    const note = await prisma.note.create({
      data: { title: 'Detail', authorId: userId, teamId },
    });

    const res = await app.inject({ method: 'GET', url: `/notes/${note.id}` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.author.email).toBe('author@bluestaq.com');
    expect(body.team.name).toBe('Engineering');
  });

  it('should return 404 for an unknown note', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/notes/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
  });

  // ── PUT /notes/:id — Optimistic Concurrency Control ─────────────────

  it('should update a note when the correct version is provided', async () => {
    const note = await prisma.note.create({
      data: { title: 'Original', content: 'Old', authorId: userId, version: 1 },
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/notes/${note.id}`,
      payload: { title: 'Updated', version: 1 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.version).toBe(2);
  });

  it('should return 409 Conflict when a stale version is provided', async () => {
    const note = await prisma.note.create({
      data: { title: 'Contested', authorId: userId, version: 1 },
    });

    // Simulate another user advancing the version
    await prisma.note.update({
      where: { id: note.id },
      data: { version: { increment: 1 } },
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/notes/${note.id}`,
      payload: { title: 'Too Late', version: 1 },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('Conflict');
    expect(res.json().message).toContain('modified by another user');
  });

  it('should return 404 when updating a note that does not exist', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/notes/00000000-0000-0000-0000-000000000000',
      payload: { title: 'Ghost', version: 1 },
    });

    expect(res.statusCode).toBe(404);
  });

  // ── DELETE /notes/:id ───────────────────────────────────────────────

  it('should delete a note (204)', async () => {
    const note = await prisma.note.create({
      data: { title: 'Doomed', authorId: userId },
    });

    const res = await app.inject({ method: 'DELETE', url: `/notes/${note.id}` });

    expect(res.statusCode).toBe(204);

    // Verify it's actually gone
    const check = await prisma.note.findUnique({ where: { id: note.id } });
    expect(check).toBeNull();
  });

  it('should return 404 when deleting a note that does not exist', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/notes/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
  });
});
