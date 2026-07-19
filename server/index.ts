import 'dotenv/config';
import { closeDatabase, ensureAdmin, initializeDatabase } from './db.js';
import { config } from './config.js';
import { createApp } from './app.js';

await initializeDatabase();
await ensureAdmin();
const server = createApp().listen(config.PORT, () => console.log(`Asterivum listening on port ${config.PORT} (${config.NODE_ENV})`));

async function shutdown(signal:string) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => { await closeDatabase(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
