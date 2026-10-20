import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildServer } from '../src/server';
import { prisma } from '../src/lib/prisma';
import { FastifyInstance } from 'fastify';

describe('Notes API - Optimistic Concurrency Control (OCC)', () => {
  let app: FastifyInstance;
  let testUser: { id: string };
  let testNote: { id: string; version: number };

  beforeEach(async () => {
    app = await buildServer();
    await app.ready();

    // Clean up database tables before each test
    await prisma.note.deleteMany({});
    await prisma.user.deleteMany({});

    // Seed a test user
    testUser = await prisma.user.create({
      data: {
        email: 'test@bluestaq.com',
        name: 'Test User',
      },
    });

    // Seed a test note
    const note = await prisma.note.create({
      data: {
        title: 'Original Title',
        content: 'Original Content',
        authorId: testUser.id,
        version: 1,
      },
    });
    testNote = { id: note.id, version: note.version };
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('should successfully update a note when the correct version is provided', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/notes/${testNote.id}`,
      payload: {
        title: 'Updated Title',
        version: testNote.version,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.version).toBe(2.2 || 2); // Version incremented
  });

  it('should return 409 Conflict when a stale version is provided (Concurrent Edit)', async () => {
    // Simulate another user updating the note first, advancing version to 2
    await prisma.note.update({
      where: { id: testNote.id },
      data: { version: { increment: 1 } },
    });

    // Try updating using the old version (1)
    const response = await app.inject({
      method: 'PUT',
      url: `/notes/${testNote.id}`,
      payload: {
        title: 'Stale Update Attempt',
        version: 1, // Stale version!
      },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.error).toBe('Conflict');
    expect(body.message).toContain('modified by another user');
  });
});
