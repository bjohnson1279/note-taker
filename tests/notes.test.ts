import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildServer } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
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
    await prisma.noteRevision.deleteMany();
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
      payload: {
        title: 'My Note',
        content: 'Private thoughts',
        tags: ['personal', 'draft'],
        authorId: userId,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe('My Note');
    expect(body.teamId).toBeNull();
    expect(body.tags).toEqual(['personal', 'draft']);
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

  it('should list all notes with pagination metadata', async () => {
    await prisma.note.createMany({
      data: [
        { title: 'A', authorId: userId },
        { title: 'B', authorId: userId, teamId },
      ],
    });

    const res = await app.inject({ method: 'GET', url: '/notes' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.limit).toBe(20);
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

    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].title).toBe('Mine');
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

    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].title).toBe('Team');
  });

  it('should filter notes by tag (?tag=...)', async () => {
    await prisma.note.create({
      data: { title: 'Security RFC', tags: ['security', 'rfc'], authorId: userId },
    });
    await prisma.note.create({
      data: { title: 'Frontend Plan', tags: ['frontend'], authorId: userId },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/notes?tag=security',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].title).toBe('Security RFC');
  });

  it('should search notes by keyword in title or content (?q=...)', async () => {
    await prisma.note.create({
      data: {
        title: 'Kubernetes Architecture',
        content: 'Overview of control plane pods',
        authorId: userId,
      },
    });
    await prisma.note.create({
      data: {
        title: 'Lunch Menu',
        content: 'Tacos on Tuesday',
        authorId: userId,
      },
    });

    // 1. Search matching title
    const resTitle = await app.inject({
      method: 'GET',
      url: '/notes?q=kubernetes',
    });
    expect(resTitle.statusCode).toBe(200);
    expect(resTitle.json().data).toHaveLength(1);
    expect(resTitle.json().data[0].title).toBe('Kubernetes Architecture');

    // 2. Search matching content
    const resContent = await app.inject({
      method: 'GET',
      url: '/notes?q=tacos',
    });
    expect(resContent.statusCode).toBe(200);
    expect(resContent.json().data).toHaveLength(1);
    expect(resContent.json().data[0].title).toBe('Lunch Menu');

    // 3. Search with no matches
    const resEmpty = await app.inject({
      method: 'GET',
      url: '/notes?q=nonexistentquery',
    });
    expect(resEmpty.statusCode).toBe(200);
    expect(resEmpty.json().data).toHaveLength(0);
  });

  it('should paginate notes using limit and cursor', async () => {
    // Seed 3 notes
    const n1 = await prisma.note.create({
      data: { title: 'Page Note 1', authorId: userId },
    });
    const n2 = await prisma.note.create({
      data: { title: 'Page Note 2', authorId: userId },
    });
    const n3 = await prisma.note.create({
      data: { title: 'Page Note 3', authorId: userId },
    });

    // Page 1: Request limit=2
    const page1Res = await app.inject({
      method: 'GET',
      url: '/notes?limit=2',
    });
    expect(page1Res.statusCode).toBe(200);
    const page1 = page1Res.json();
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.nextCursor).toBeDefined();

    // Page 2: Request limit=2 using cursor from Page 1
    const page2Res = await app.inject({
      method: 'GET',
      url: `/notes?limit=2&cursor=${page1.pagination.nextCursor}`,
    });
    expect(page2Res.statusCode).toBe(200);
    const page2 = page2Res.json();
    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
    expect(page2.pagination.nextCursor).toBeNull();
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

  // ── PUT /notes/:id — OCC & Revision Tracking ────────────────────────

  it('should update a note and create a revision snapshot in history', async () => {
    const note = await prisma.note.create({
      data: {
        title: 'Original Title',
        content: 'Original Content',
        tags: ['v1'],
        authorId: userId,
        version: 1,
      },
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/notes/${note.id}`,
      payload: {
        title: 'Updated Title',
        content: 'Updated Content',
        tags: ['v2', 'reviewed'],
        version: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.version).toBe(2);
    expect(res.json().data.tags).toEqual(['v2', 'reviewed']);

    // Verify history endpoint
    const historyRes = await app.inject({
      method: 'GET',
      url: `/notes/${note.id}/history`,
    });

    expect(historyRes.statusCode).toBe(200);
    const history = historyRes.json();
    expect(history.currentVersion).toBe(2);
    expect(history.revisions).toHaveLength(1);
    expect(history.revisions[0].version).toBe(1);
    expect(history.revisions[0].title).toBe('Original Title');
    expect(history.revisions[0].content).toBe('Original Content');
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

  it('should return 404 for history of non-existent note', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/notes/00000000-0000-0000-0000-000000000000/history',
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
