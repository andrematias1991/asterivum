import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from 'mysql2/promise';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';

export interface ExecuteResult { insertId: number; affectedRows: number }
export interface DatabaseClient {
  query<T extends object>(sql: string, params?: unknown[]): Promise<T[]>;
  first<T extends object>(sql: string, params?: unknown[]): Promise<T | undefined>;
  execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;
}

class SqliteClient implements DatabaseClient {
  constructor(readonly connection: Database.Database) {}
  async query<T extends object>(sql: string, params: unknown[] = []) { return this.connection.prepare(sql).all(...params) as T[]; }
  async first<T extends object>(sql: string, params: unknown[] = []) { return this.connection.prepare(sql).get(...params) as T | undefined; }
  async execute(sql: string, params: unknown[] = []) {
    const result = this.connection.prepare(sql).run(...params);
    return { insertId:Number(result.lastInsertRowid), affectedRows:result.changes };
  }
}

class MysqlClient implements DatabaseClient {
  constructor(readonly connection: Pool | PoolConnection) {}
  async query<T extends object>(sql: string, params: unknown[] = []) { const [rows] = await this.connection.query(sql, params); return rows as T[]; }
  async first<T extends object>(sql: string, params: unknown[] = []) { return (await this.query<T>(sql, params))[0]; }
  async execute(sql: string, params: unknown[] = []) {
    const [result] = await this.connection.execute(sql, params as never[]) as [ResultSetHeader, unknown];
    return { insertId:Number(result.insertId), affectedRows:result.affectedRows };
  }
}

let sqlite: Database.Database | undefined;
let pool: Pool | undefined;
export let db: DatabaseClient;

const sqliteStatements = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','ADMIN')),status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS birth_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,birth_date TEXT NOT NULL,birth_time TEXT NOT NULL,place TEXT NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,timezone REAL NOT NULL,timezone_id TEXT,house_system TEXT NOT NULL DEFAULT 'PLACIDUS',zodiac TEXT NOT NULL DEFAULT 'TROPICAL',notes TEXT NOT NULL DEFAULT '',is_primary INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS saved_reports (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,profile_id INTEGER REFERENCES birth_profiles(id) ON DELETE SET NULL,title TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf_hash TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,user_agent TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_user ON birth_profiles(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reports_user ON saved_reports(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
];

const mysqlStatements = [
  `CREATE TABLE IF NOT EXISTS users (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,email VARCHAR(254) NOT NULL UNIQUE,password_hash VARCHAR(255) NOT NULL,name VARCHAR(80) NOT NULL,role ENUM('USER','ADMIN') NOT NULL DEFAULT 'USER',status ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS birth_profiles (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,name VARCHAR(100) NOT NULL,birth_date DATE NOT NULL,birth_time TIME NOT NULL,place VARCHAR(150) NOT NULL,latitude DOUBLE NOT NULL,longitude DOUBLE NOT NULL,timezone DOUBLE NOT NULL,timezone_id VARCHAR(80) NULL,house_system ENUM('PLACIDUS','WHOLE_SIGN','EQUAL') NOT NULL DEFAULT 'PLACIDUS',zodiac ENUM('TROPICAL','SIDEREAL') NOT NULL DEFAULT 'TROPICAL',notes TEXT NOT NULL,is_primary BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX idx_profiles_user(user_id),CONSTRAINT fk_profiles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS saved_reports (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,profile_id BIGINT UNSIGNED NULL,title VARCHAR(150) NOT NULL,kind VARCHAR(40) NOT NULL,payload JSON NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_reports_user(user_id),CONSTRAINT fk_reports_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,CONSTRAINT fk_reports_profile FOREIGN KEY(profile_id) REFERENCES birth_profiles(id) ON DELETE SET NULL) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,csrf_hash CHAR(64) NOT NULL,expires_at TIMESTAMP NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,user_agent VARCHAR(255) NOT NULL DEFAULT '',INDEX idx_sessions_user(user_id),INDEX idx_sessions_expiry(expires_at),CONSTRAINT fk_sessions_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`,
];

export async function initializeDatabase() {
  if (config.DATABASE_URL) {
    const url = new URL(config.DATABASE_URL);
    pool = mysql.createPool({
      host:url.hostname,
      port:Number(url.port || 3306),
      user:decodeURIComponent(url.username),
      password:decodeURIComponent(url.password),
      database:decodeURIComponent(url.pathname.replace(/^\//, '')),
      connectionLimit:10,
      enableKeepAlive:true,
      timezone:'Z',
      dateStrings:true,
      decimalNumbers:true,
      ...(config.DATABASE_SSL ? { ssl:{ minVersion:'TLSv1.2', rejectUnauthorized:true } } : {}),
    });
    db = new MysqlClient(pool);
    await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY,name VARCHAR(120) NOT NULL,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
    if (!await db.first('SELECT version FROM schema_migrations WHERE version=1')) {
      for (const statement of mysqlStatements) await db.execute(statement);
      await db.execute("INSERT IGNORE INTO schema_migrations(version,name) VALUES(1,'initial production schema')");
    }
  } else {
    const { default:SqliteDatabase } = await import('better-sqlite3');
    const path = config.DATABASE_PATH || resolve('data/astralis.db');
    mkdirSync(dirname(path), { recursive:true });
    sqlite = new SqliteDatabase(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const columns = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='birth_profiles'").get();
    if (columns) {
      const profileColumns = sqlite.prepare('PRAGMA table_info(birth_profiles)').all() as {name:string}[];
      if (!profileColumns.some(column => column.name === 'timezone_id')) sqlite.exec('ALTER TABLE birth_profiles ADD COLUMN timezone_id TEXT');
    }
    db = new SqliteClient(sqlite);
    await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    if (!await db.first('SELECT version FROM schema_migrations WHERE version=1')) {
      for (const statement of sqliteStatements) await db.execute(statement);
      await db.execute("INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(1,'initial production schema')");
    }
  }
  await db.execute('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP');
}

export async function transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
  if (pool) {
    const connection = await pool.getConnection();
    try { await connection.beginTransaction(); const result = await work(new MysqlClient(connection)); await connection.commit(); return result; }
    catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  if (!sqlite) throw new Error('Database is not initialized');
  sqlite.exec('BEGIN IMMEDIATE');
  try { const result = await work(db); sqlite.exec('COMMIT'); return result; }
  catch (error) { sqlite.exec('ROLLBACK'); throw error; }
}

export async function ensureAdmin() {
  if (!config.ADMIN_EMAIL || !config.ADMIN_INITIAL_PASSWORD) return;
  const email = config.ADMIN_EMAIL.toLowerCase();
  if (await db.first('SELECT id FROM users WHERE email=?', [email])) return;
  const hash = await bcrypt.hash(config.ADMIN_INITIAL_PASSWORD, 12);
  await db.execute('INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)', [email,hash,'Asterivum Admin','ADMIN']);
  console.log(`Created initial administrator ${email}; remove ADMIN_INITIAL_PASSWORD from the environment now.`);
}

export async function closeDatabase() { if (pool) await pool.end(); if (sqlite) sqlite.close(); }
