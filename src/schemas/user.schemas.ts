import { z } from 'zod';

// ── Request Schemas ───────────────────────────────────────────────────

export const CreateUserBody = z.object({
  email: z.string().email('Must be a valid email address'),
  name: z.string().min(1, 'Name is required').max(100),
});

export const UserParams = z.object({
  id: z.string().uuid('User ID must be a valid UUID'),
});

