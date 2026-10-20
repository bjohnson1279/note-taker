import { buildServer } from './app';

// ── Entry Point ───────────────────────────────────────────────────────
// Separated from the app factory (app.ts) so that test suites can import
// buildServer() without triggering the listen() side-effect.

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
