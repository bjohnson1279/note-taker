import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CreateTeamBody,
  TeamParams,
  AddMemberBody,
  RemoveMemberParams,
} from '../schemas/team.schemas.js';
import { prisma } from '../lib/prisma.js';

export async function teamRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // ── CREATE TEAM ─────────────────────────────────────────────────────
  server.post('/teams', {
    schema: {
      body: CreateTeamBody,
      description: 'Create a new team',
      tags: ['Teams'],
    },
  }, async (request, reply) => {
    const { name, description } = request.body;

    const existing = await prisma.team.findUnique({ where: { name } });
    if (existing) {
      return reply.code(409).send({
        error: 'Conflict',
        message: `A team named "${name}" already exists.`,
      });
    }

    const team = await prisma.team.create({ data: { name, description } });
    return reply.code(201).send(team);
  });

  // ── LIST TEAMS ──────────────────────────────────────────────────────
  server.get('/teams', {
    schema: {
      description: 'List all teams with member and note counts',
      tags: ['Teams'],
    },
  }, async () => {
    return prisma.team.findMany({
      include: { _count: { select: { members: true, notes: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  // ── GET TEAM BY ID ──────────────────────────────────────────────────
  server.get('/teams/:id', {
    schema: {
      params: TeamParams,
      description: 'Get team details including its members',
      tags: ['Teams'],
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, name: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!team) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Team with id "${id}" not found.`,
      });
    }

    return team;
  });

  // ── ADD MEMBER ──────────────────────────────────────────────────────
  server.post('/teams/:id/members', {
    schema: {
      params: TeamParams,
      body: AddMemberBody,
      description: 'Add a user to a team',
      tags: ['Teams'],
    },
  }, async (request, reply) => {
    const { id: teamId } = request.params;
    const { userId, role } = request.body;

    // Verify both the team and the user exist before creating the membership
    const [team, user] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);

    if (!team) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Team with id "${teamId}" not found.`,
      });
    }
    if (!user) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `User with id "${userId}" not found.`,
      });
    }

    // Guard against duplicate membership
    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (existing) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'This user is already a member of this team.',
      });
    }

    const member = await prisma.teamMember.create({
      data: { teamId, userId, role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    return reply.code(201).send(member);
  });

  // ── REMOVE MEMBER ───────────────────────────────────────────────────
  server.delete('/teams/:id/members/:userId', {
    schema: {
      params: RemoveMemberParams,
      description: 'Remove a user from a team',
      tags: ['Teams'],
    },
  }, async (request, reply) => {
    const { id: teamId, userId } = request.params;

    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });

    if (!membership) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'This user is not a member of this team.',
      });
    }

    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });

    return reply.code(204).send();
  });
}

