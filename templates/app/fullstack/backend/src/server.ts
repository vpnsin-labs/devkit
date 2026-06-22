import { createApp } from './app.js';
import { env } from './env.js';
import { connectDb, disconnectDb } from './db.js';

async function start(): Promise<void> {
  await connectDb();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Graceful shutdown so in-flight requests drain and Mongo disconnects cleanly.
  function shutdown(signal: string): void {
    console.info(`${signal} received, shutting down…`);
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
