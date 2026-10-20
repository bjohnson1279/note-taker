import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { noteRoutes } from './routes/notes.routes.js';
import { userRoutes } from './routes/users.routes.js';
import { teamRoutes } from './routes/teams.routes.js';

/**
 * Application factory — separated from the startup entry point so that
 * tests can import `buildServer()` without triggering the listen() side-effect.
 */
export async function buildServer() {
  const app = Fastify({ logger: true });

  // ── Validation & Serialization ──────────────────────────────────────
  // Zod schemas drive both runtime validation AND automatic Swagger docs
  // from a single source of truth — no separate OpenAPI YAML to maintain.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ── API Documentation ───────────────────────────────────────────────
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Team Notes Service API',
        description: 'A collaborative note-taking REST API — Bluestaq Senior Staff SE Assessment',
        version: '1.0.0',
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // ── Health Check ────────────────────────────────────────────────────
  app.get('/health', {
    schema: { description: 'Liveness probe', tags: ['System'] },
  }, async () => ({ status: 'ok' }));

  // ── Domain Routes ───────────────────────────────────────────────────
  await app.register(userRoutes);
  await app.register(teamRoutes);
  await app.register(noteRoutes);

  return app;
}

