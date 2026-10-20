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
});

