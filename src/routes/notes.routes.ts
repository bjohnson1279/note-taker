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
    const { title, content, authorId, teamId } = request.body;

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
      data: { title, content, authorId, teamId },
      include: { author: { select: { id: true, email: true, name: true } } },
    });

    return reply.code(201).send(note);
  });

  // ── LIST NOTES ──────────────────────────────────────────────────────
  server.get('/notes', {
    schema: {
      querystring: NoteQuerystring,
      description: 'List notes. Optionally filter by authorId and/or teamId.',
      tags: ['Notes'],
    },
  }, async (request) => {
    const { authorId, teamId } = request.query;

    // Build a dynamic WHERE clause from the optional query params
    const where: Record<string, string> = {};
    if (authorId) where.authorId = authorId;
    if (teamId) where.teamId = teamId;

    return prisma.note.findMany({
      where,
      include: { author: { select: { id: true, email: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
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

  // ── UPDATE NOTE (Optimistic Concurrency Control) ────────────────────
  server.put('/notes/:id', {
    schema: {
      params: NoteParams,
      body: UpdateNoteBody,
      description:
        'Update a note. Requires the current `version` number to prevent ' +
        'lost-update race conditions (optimistic concurrency control).',
      tags: ['Notes'],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { title, content, version } = request.body;

    try {
      // Atomic conditional update — only succeeds when the row's version
      // matches the one the client last read.  If another user saved in
      // between, zero rows are affected and we return 409 Conflict.
      const updated = await prisma.$queryRaw<Array<{
        id: string;
        title: string;
        content: string;
        version: number;
        updated_at: Date;
      }>>`
        UPDATE notes
        SET
          title      = COALESCE(${title}, title),
          content    = COALESCE(${content}, content),
          version    = version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND version = ${version}
        RETURNING id, title, content, version, updated_at;
      `;

      if (!updated || updated.length === 0) {
        // Distinguish "note doesn't exist" from "version mismatch"
        const exists = await prisma.note.findUnique({ where: { id } });
        if (!exists) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Note with id "${id}" not found.`,
          });
        }

        return reply.code(409).send({
          error: 'Conflict',
          message:
            'This note has been modified by another user. ' +
            'Please fetch the latest version and retry.',
        });
      }

      return { message: 'Note updated successfully', data: updated[0] };
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
