import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CreateNoteBody,
  UpdateNoteBody,
  NoteParams,
  NoteQuerystring,
} from '../schemas/note.schemas.js';
import { prisma } from '../lib/prisma.js';

export async function noteRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // ── CREATE NOTE ─────────────────────────────────────────────────────
  server.post('/notes', {
    schema: {
      body: CreateNoteBody,
      description: 'Create a personal note or share one with a team',
      tags: ['Notes'],
    },
  }, async (request, reply) => {
    const { title, content, tags, authorId, teamId } = request.body;

    // Verify the author exists
    const author = await prisma.user.findUnique({ where: { id: authorId } });
    if (!author) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `User with id "${authorId}" not found.`,
      });
    }

    // If sharing to a team, verify the author is actually a member
    if (teamId) {
      const membership = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: authorId } },
      });
      if (!membership) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Author must be a member of the team to create a shared note.',
        });
      }
    }

    const note = await prisma.note.create({
      data: { title, content, tags, authorId, teamId },
      include: {
        author: { select: { id: true, email: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    return reply.code(201).send(note);
  });

  // ── LIST & SEARCH NOTES (with Cursor Pagination & Tag Filtering) ────
  server.get('/notes', {
    schema: {
      querystring: NoteQuerystring,
      description:
        'List or search notes with cursor-based pagination. ' +
        'Supports keyword search across title and content (?q=), ' +
        'filtering by tag (?tag=), authorId, and/or teamId.',
      tags: ['Notes'],
    },
  }, async (request) => {
    const { authorId, teamId, tag, q, cursor, limit } = request.query;

    // Build dynamic Prisma WHERE clause
    const where: Record<string, any> = {};
    if (authorId) where.authorId = authorId;
    if (teamId) where.teamId = teamId;

    // Tag filtering (PostgreSQL array containment)
    if (tag) {
      where.tags = { has: tag };
    }

    // Keyword search across title and content (case-insensitive)
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Keyset / cursor-based pagination:
    // Request (limit + 1) items to determine if a subsequent page exists
    // without executing a costly COUNT(*) table scan.
    const take = limit;
    const notes = await prisma.note.findMany({
      where,
      take: take + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1, // Skip the cursor itself
          }
        : {}),
      include: {
        author: { select: { id: true, email: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = notes.length > take;
    const items = hasMore ? notes.slice(0, take) : notes;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      data: items,
      pagination: {
        nextCursor,
        hasMore,
        limit,
      },
    };
  });

  // ── GET NOTE BY ID ──────────────────────────────────────────────────
  server.get('/notes/:id', {
    schema: {
      params: NoteParams,
      description: 'Retrieve a single note by its ID',
      tags: ['Notes'],
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const note = await prisma.note.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, email: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    if (!note) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Note with id "${id}" not found.`,
      });
    }

    return note;
  });

  // ── GET NOTE REVISION HISTORY ───────────────────────────────────────
  server.get('/notes/:id/history', {
    schema: {
      params: NoteParams,
      description: 'Retrieve the historical revision audit trail for a note, ordered by version descending',
      tags: ['Notes'],
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Note with id "${id}" not found.`,
      });
    }

    const revisions = await prisma.noteRevision.findMany({
      where: { noteId: id },
      include: {
        editor: { select: { id: true, email: true, name: true } },
      },
      orderBy: { version: 'desc' },
    });

    return {
      noteId: id,
      currentVersion: note.version,
      revisions,
    };
  });

  // ── UPDATE NOTE (Optimistic Concurrency Control + Revision Snapshot) ──
  server.put('/notes/:id', {
    schema: {
      params: NoteParams,
      body: UpdateNoteBody,
      description:
        'Update a note. Requires the current `version` number for OCC. ' +
        'Upon successful update, captures an immutable revision snapshot into history.',
      tags: ['Notes'],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { title, content, tags, version, editorId } = request.body;

    try {
      // 1. Check existence first
      const currentNote = await prisma.note.findUnique({ where: { id } });
      if (!currentNote) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Note with id "${id}" not found.`,
        });
      }

      // 2. Perform atomic conditional update & revision creation in a transaction
      const updateResult = await prisma.$transaction(async (tx) => {
        // Atomic OCC update
        const updatedCount = await tx.note.updateMany({
          where: { id, version },
          data: {
            ...(title !== undefined && { title }),
            ...(content !== undefined && { content }),
            ...(tags !== undefined && { tags }),
            version: { increment: 1 },
          },
        });

        if (updatedCount.count === 0) {
          return null; // Concurrent modification occurred
        }

        // Save prior snapshot in note_revisions
        await tx.noteRevision.create({
          data: {
            noteId: id,
            version: currentNote.version,
            title: currentNote.title,
            content: currentNote.content,
            tags: currentNote.tags,
            editorId: editorId || currentNote.authorId,
          },
        });

        // Fetch refreshed note record
        return tx.note.findUniqueOrThrow({
          where: { id },
          include: {
            author: { select: { id: true, email: true, name: true } },
            team: { select: { id: true, name: true } },
          },
        });
      });

      if (!updateResult) {
        return reply.code(409).send({
          error: 'Conflict',
          message:
            'This note has been modified by another user. ' +
            'Please fetch the latest version and retry.',
        });
      }

      return { message: 'Note updated successfully', data: updateResult };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // ── DELETE NOTE ─────────────────────────────────────────────────────
  server.delete('/notes/:id', {
    schema: {
      params: NoteParams,
      description: 'Delete a note by its ID',
      tags: ['Notes'],
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Note with id "${id}" not found.`,
      });
    }

    await prisma.note.delete({ where: { id } });
    return reply.code(204).send();
  });
}
