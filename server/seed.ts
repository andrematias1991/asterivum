import 'dotenv/config';
import { closeDatabase, ensureAdmin, initializeDatabase } from './db.js';
await initializeDatabase();
await ensureAdmin();
await closeDatabase();
console.log('Admin account is ready.');
