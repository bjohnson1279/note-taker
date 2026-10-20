import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateUserBody, UserParams } from '../schemas/user.schemas';
import { prisma } from '../lib/prisma';

export async function userRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // ── CREATE USER ─────────────────────────────────────────────────────
  server.post('/users', {
    schema: {
      body: CreateUserBody,
      description: 'Register a new user',
      tags: ['Users'],
    },
  }, async (request, reply) => {
    const { email, name } = request.body;

    // Guard: email uniqueness (Prisma would throw, but a clear 409 is friendlier)
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({
        error: 'Conflict',
        message: `A user with email "${email}" already exists.`,
      });
    }

    const user = await prisma.user.create({ data: { email, name } });
    return reply.code(201).send(user);
  });

  // ── LIST USERS ──────────────────────────────────────────────────────
  server.get('/users', {
    schema: {
      description: 'List all registered users',
      tags: ['Users'],
    },
  }, async () => {
    return prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  });

  // ── GET USER BY ID ──────────────────────────────────────────────────
  server.get('/users/:id', {
    schema: {
      params: UserParams,
      description: 'Get a user by ID, including their team memberships',
      tags: ['Users'],
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        teams: {
          include: { team: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `User with id "${id}" not found.`,
      });
    }

    return user;
  });
}

