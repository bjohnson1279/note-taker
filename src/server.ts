import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { noteRoutes } from './routes/notes.routes';

export async function buildServer() {
  const app = Fastify({ logger: true });

  // 1. Register Zod validators and serializers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // 2. Register Swagger for auto-generated interactive documentation (/docs)
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Team Notes Service API',
        description: 'Bluestaq Take-Home Backend Assessment',
        version: '1.0.0',
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // 3. Register Routes
  await app.register(noteRoutes);

  return app;
}

// Start the server if run directly
// Start the server directly when running via tsx/node
(async () => {
  try {
    const server = await buildServer();
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Server is running at http://localhost:${port}`);
    console.log(`📄 Swagger docs available at http://localhost:${port}/docs`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
