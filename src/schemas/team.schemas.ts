import { z } from 'zod';

// ── Request Schemas ───────────────────────────────────────────────────

export const CreateTeamBody = z.object({
  name: z.string().min(1, 'Team name is required').max(100),
  description: z.string().max(500).optional(),
});

export const TeamParams = z.object({
  id: z.string().uuid('Team ID must be a valid UUID'),
});

export const AddMemberBody = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

export const RemoveMemberParams = z.object({
  id: z.string().uuid('Team ID must be a valid UUID'),
  userId: z.string().uuid('User ID must be a valid UUID'),
});

