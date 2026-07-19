import 'dotenv/config';
import { closeDatabase, ensureAdmin, initializeDatabase } from './db.js';
import { config } from './config.js';
import { createApp } from './app.js';

const STARTUP_ATTEMPTS = config.isProduction ? 10 : 1;

async function initializeDatabaseWithRetry() {
  for (let attempt = 1; attempt <= STARTUP_ATTEMPTS; attempt += 1) {
    try {
      await initializeDatabase();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await closeDatabase().catch(() => undefined);
      if (attempt === STARTUP_ATTEMPTS) throw new Error(`Database initialization failed after ${attempt} attempts: ${message}`);
      const delayMs = Math.min(attempt * 2_000, 10_000);
      console.warn(`Database unavailable (attempt ${attempt}/${STARTUP_ATTEMPTS}); retrying in ${delayMs / 1_000}s: ${message}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

await initializeDatabaseWithRetry();
await ensureAdmin();
const server = createApp().listen(config.PORT, '0.0.0.0', () => console.log(`Asterivum listening on 0.0.0.0:${config.PORT} (${config.NODE_ENV})`));

async function shutdown(signal:string) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => { await closeDatabase(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
