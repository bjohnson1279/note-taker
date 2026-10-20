import { buildServer } from './app.js';
import { prisma } from './lib/prisma.js';

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

    // ── Graceful Shutdown ─────────────────────────────────────────────
    // Intercept termination signals (SIGINT from Ctrl+C, SIGTERM from Docker/K8s)
    // to cleanly drain inflight requests and disconnect database connection pools.
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
        try {
          await server.close();
          console.log('  ✔ HTTP server closed');
          await prisma.$disconnect();
          console.log('  ✔ Database connection pool disconnected');
          process.exit(0);
        } catch (err) {
          console.error('❌ Error during graceful shutdown:', err);
          process.exit(1);
        }
      });
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
