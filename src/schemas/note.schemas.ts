import { z } from 'zod';

// ── Request Schemas ───────────────────────────────────────────────────

export const CreateNoteBody = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  content: z.string().default(''),
  authorId: z.string().uuid('Author ID must be a valid UUID'),
  teamId: z.string().uuid('Team ID must be a valid UUID').nullable().optional(),
});

export const UpdateNoteBody = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
  version: z.number().int().positive(
    'Version is required for optimistic concurrency control',
  ),
});

export const NoteParams = z.object({
  id: z.string().uuid('Note ID must be a valid UUID'),
});

export const NoteQuerystring = z.object({
  authorId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('Full-text keyword search across note title and content'),
  cursor: z
    .string()
    .uuid()
    .optional()
    .describe('Pagination cursor (id of the last item in the previous page)'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Maximum number of items to return (1-100, default 20)'),
});
