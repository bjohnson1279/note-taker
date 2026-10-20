import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

// Validation Schemas
export const UpdateNoteSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
  version: z.number().int().positive("Version is required for Optimistic Concurrency Control"),
});

export async function noteRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // UPDATE NOTE WITH OCC
  server.put('/notes/:id', {
    schema: {
      body: UpdateNoteSchema,
      description: 'Update a note with version check for concurrency control',
      tags: ['Notes'],
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { title, content, version } = request.body;

    try {
      // Execute raw SQL or conditional update to ensure version matches atomically.
      // This prevents race conditions where two users overwrite each other's edits.
      const updatedNotes = await prisma.$queryRaw<Array<{ id: string; version: number; updated_at: Date }>>`
        UPDATE notes
        SET 
          title = COALESCE(${title}, title),
          content = COALESCE(${content}, content),
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND version = ${version}
        RETURNING id, version, updated_at;
      `;

      // If no rows were updated, it means the version in the database has advanced
      // (another user modified the note concurrently).
      if (!updatedNotes || updatedNotes.length === 0) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'The note has been modified by another user. Please fetch the latest version and retry.',
        });
      }

      return {
        message: 'Note updated successfully',
        data: updatedNotes[0],
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}
