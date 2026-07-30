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

const sqliteDirectoryStatements = [
  `CREATE TABLE IF NOT EXISTS chart_annotations (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,profile_id INTEGER REFERENCES birth_profiles(id) ON DELETE CASCADE,title TEXT NOT NULL,chart_mode TEXT NOT NULL CHECK(chart_mode IN ('NATAL','TRANSIT','PROGRESSION','SYNASTRY')),chart_context TEXT NOT NULL,annotations TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS therapy_specialties (id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT NOT NULL UNIQUE,name_en TEXT NOT NULL,name_pt TEXT NOT NULL,regulated INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS provider_listings (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING','APPROVED','REJECTED','SUSPENDED')),draft_payload TEXT NOT NULL,published_payload TEXT,published_revision_id INTEGER,moderation_feedback TEXT NOT NULL DEFAULT '',submitted_at TEXT,approved_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS listing_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT,listing_id INTEGER NOT NULL REFERENCES provider_listings(id) ON DELETE CASCADE,submitted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','CHANGES_REQUESTED','REJECTED')),admin_note TEXT NOT NULL DEFAULT '',reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS listing_locations (id INTEGER PRIMARY KEY AUTOINCREMENT,listing_id INTEGER NOT NULL REFERENCES provider_listings(id) ON DELETE CASCADE,label TEXT NOT NULL,address TEXT NOT NULL DEFAULT '',city TEXT NOT NULL,region TEXT NOT NULL DEFAULT '',country TEXT NOT NULL,postal_code TEXT NOT NULL DEFAULT '',latitude REAL NOT NULL,longitude REAL NOT NULL,marker_precision TEXT NOT NULL CHECK(marker_precision IN ('EXACT','APPROXIMATE')),is_primary INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS listing_specialties (listing_id INTEGER NOT NULL REFERENCES provider_listings(id) ON DELETE CASCADE,specialty_id INTEGER NOT NULL REFERENCES therapy_specialties(id),PRIMARY KEY(listing_id,specialty_id))`,
  `CREATE TABLE IF NOT EXISTS listing_credentials (id INTEGER PRIMARY KEY AUTOINCREMENT,listing_id INTEGER NOT NULL REFERENCES provider_listings(id) ON DELETE CASCADE,specialty_id INTEGER REFERENCES therapy_specialties(id),title TEXT NOT NULL,issuer TEXT NOT NULL DEFAULT '',registration_number TEXT NOT NULL DEFAULT '',verified INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS moderation_events (id INTEGER PRIMARY KEY AUTOINCREMENT,listing_id INTEGER NOT NULL REFERENCES provider_listings(id) ON DELETE CASCADE,revision_id INTEGER REFERENCES listing_revisions(id) ON DELETE SET NULL,admin_id INTEGER NOT NULL REFERENCES users(id),action TEXT NOT NULL,from_status TEXT NOT NULL,to_status TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_annotations_user ON chart_annotations(user_id,updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_user ON provider_listings(user_id,updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_status ON provider_listings(status,approved_at)`,
  `CREATE INDEX IF NOT EXISTS idx_listing_locations_geo ON listing_locations(latitude,longitude)`,
  `CREATE INDEX IF NOT EXISTS idx_revisions_status ON listing_revisions(status,created_at)`,
];

const mysqlDirectoryStatements = [
  `CREATE TABLE IF NOT EXISTS chart_annotations (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,profile_id BIGINT UNSIGNED NULL,title VARCHAR(150) NOT NULL,chart_mode ENUM('NATAL','TRANSIT','PROGRESSION','SYNASTRY') NOT NULL,chart_context JSON NOT NULL,annotations JSON NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX idx_annotations_user(user_id,updated_at),CONSTRAINT fk_annotations_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,CONSTRAINT fk_annotations_profile FOREIGN KEY(profile_id) REFERENCES birth_profiles(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS therapy_specialties (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,slug VARCHAR(80) NOT NULL UNIQUE,name_en VARCHAR(100) NOT NULL,name_pt VARCHAR(100) NOT NULL,regulated BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INT NOT NULL DEFAULT 0) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS provider_listings (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,status ENUM('DRAFT','PENDING','APPROVED','REJECTED','SUSPENDED') NOT NULL DEFAULT 'DRAFT',draft_payload JSON NOT NULL,published_payload JSON NULL,published_revision_id BIGINT UNSIGNED NULL,moderation_feedback TEXT NOT NULL,submitted_at TIMESTAMP NULL,approved_at TIMESTAMP NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX idx_listings_user(user_id,updated_at),INDEX idx_listings_status(status,approved_at),CONSTRAINT fk_listings_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS listing_revisions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,listing_id BIGINT UNSIGNED NOT NULL,submitted_by BIGINT UNSIGNED NOT NULL,payload JSON NOT NULL,status ENUM('PENDING','APPROVED','CHANGES_REQUESTED','REJECTED') NOT NULL DEFAULT 'PENDING',admin_note TEXT NOT NULL,reviewed_by BIGINT UNSIGNED NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TIMESTAMP NULL,INDEX idx_revisions_status(status,created_at),CONSTRAINT fk_revisions_listing FOREIGN KEY(listing_id) REFERENCES provider_listings(id) ON DELETE CASCADE,CONSTRAINT fk_revisions_submitter FOREIGN KEY(submitted_by) REFERENCES users(id) ON DELETE CASCADE,CONSTRAINT fk_revisions_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS listing_locations (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,listing_id BIGINT UNSIGNED NOT NULL,label VARCHAR(100) NOT NULL,address VARCHAR(180) NOT NULL,city VARCHAR(100) NOT NULL,region VARCHAR(100) NOT NULL,country VARCHAR(100) NOT NULL,postal_code VARCHAR(24) NOT NULL,latitude DOUBLE NOT NULL,longitude DOUBLE NOT NULL,marker_precision ENUM('EXACT','APPROXIMATE') NOT NULL,is_primary BOOLEAN NOT NULL DEFAULT FALSE,INDEX idx_listing_locations_geo(latitude,longitude),CONSTRAINT fk_locations_listing FOREIGN KEY(listing_id) REFERENCES provider_listings(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS listing_specialties (listing_id BIGINT UNSIGNED NOT NULL,specialty_id BIGINT UNSIGNED NOT NULL,PRIMARY KEY(listing_id,specialty_id),CONSTRAINT fk_listing_specialties_listing FOREIGN KEY(listing_id) REFERENCES provider_listings(id) ON DELETE CASCADE,CONSTRAINT fk_listing_specialties_specialty FOREIGN KEY(specialty_id) REFERENCES therapy_specialties(id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS listing_credentials (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,listing_id BIGINT UNSIGNED NOT NULL,specialty_id BIGINT UNSIGNED NULL,title VARCHAR(120) NOT NULL,issuer VARCHAR(140) NOT NULL,registration_number VARCHAR(100) NOT NULL,verified BOOLEAN NOT NULL DEFAULT FALSE,CONSTRAINT fk_credentials_listing FOREIGN KEY(listing_id) REFERENCES provider_listings(id) ON DELETE CASCADE,CONSTRAINT fk_credentials_specialty FOREIGN KEY(specialty_id) REFERENCES therapy_specialties(id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS moderation_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,listing_id BIGINT UNSIGNED NOT NULL,revision_id BIGINT UNSIGNED NULL,admin_id BIGINT UNSIGNED NOT NULL,action VARCHAR(40) NOT NULL,from_status VARCHAR(30) NOT NULL,to_status VARCHAR(30) NOT NULL,note TEXT NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_moderation_listing(listing_id,created_at),CONSTRAINT fk_moderation_listing FOREIGN KEY(listing_id) REFERENCES provider_listings(id) ON DELETE CASCADE,CONSTRAINT fk_moderation_revision FOREIGN KEY(revision_id) REFERENCES listing_revisions(id) ON DELETE SET NULL,CONSTRAINT fk_moderation_admin FOREIGN KEY(admin_id) REFERENCES users(id)) ENGINE=InnoDB`,
];

const sqlitePlatformStatements = [
  `ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'NORMAL' CHECK(account_type IN ('NORMAL','PROFESSIONAL','CLINIC'))`,
  `ALTER TABLE users ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'NONE' CHECK(verification_status IN ('NONE','PENDING','VERIFIED','REJECTED'))`,
  `ALTER TABLE users ADD COLUMN last_login_at TEXT`,
  `ALTER TABLE users ADD COLUMN previous_login_at TEXT`,
  `ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE therapy_specialties ADD COLUMN icon_key TEXT NOT NULL DEFAULT 'sparkles'`,
  `CREATE TABLE IF NOT EXISTS page_view_daily (view_date TEXT NOT NULL,page_key TEXT NOT NULL,anonymous_count INTEGER NOT NULL DEFAULT 0,authenticated_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(view_date,page_key))`,
  `CREATE TABLE IF NOT EXISTS activity_events (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,event_type TEXT NOT NULL,entity_type TEXT NOT NULL DEFAULT '',entity_id INTEGER,metadata TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS specialty_suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('NEW_SPECIALTY','CORRECTION','TRANSLATION','OTHER')),suggested_name_en TEXT NOT NULL DEFAULT '',suggested_name_pt TEXT NOT NULL DEFAULT '',message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),admin_note TEXT NOT NULL DEFAULT '',reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS listing_images (id INTEGER PRIMARY KEY AUTOINCREMENT,listing_id INTEGER NOT NULL REFERENCES provider_listings(id) ON DELETE CASCADE,storage_key TEXT NOT NULL UNIQUE,mime_type TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,alt_text TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_events_created ON activity_events(created_at,event_type)`,
  `CREATE INDEX IF NOT EXISTS idx_specialty_suggestions_status ON specialty_suggestions(status,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON listing_images(listing_id)`,
];

const mysqlPlatformStatements = [
  `ALTER TABLE users ADD COLUMN account_type ENUM('NORMAL','PROFESSIONAL','CLINIC') NOT NULL DEFAULT 'NORMAL'`,
  `ALTER TABLE users ADD COLUMN verification_status ENUM('NONE','PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'NONE'`,
  `ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL`,
  `ALTER TABLE users ADD COLUMN previous_login_at TIMESTAMP NULL`,
  `ALTER TABLE users ADD COLUMN login_count INT UNSIGNED NOT NULL DEFAULT 0`,
  `ALTER TABLE therapy_specialties ADD COLUMN icon_key VARCHAR(40) NOT NULL DEFAULT 'sparkles'`,
  `CREATE TABLE IF NOT EXISTS page_view_daily (view_date DATE NOT NULL,page_key VARCHAR(40) NOT NULL,anonymous_count BIGINT UNSIGNED NOT NULL DEFAULT 0,authenticated_count BIGINT UNSIGNED NOT NULL DEFAULT 0,PRIMARY KEY(view_date,page_key)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS activity_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NULL,event_type VARCHAR(60) NOT NULL,entity_type VARCHAR(40) NOT NULL DEFAULT '',entity_id BIGINT UNSIGNED NULL,metadata JSON NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_activity_events_created(created_at,event_type),CONSTRAINT fk_activity_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS specialty_suggestions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,kind ENUM('NEW_SPECIALTY','CORRECTION','TRANSLATION','OTHER') NOT NULL,suggested_name_en VARCHAR(100) NOT NULL DEFAULT '',suggested_name_pt VARCHAR(100) NOT NULL DEFAULT '',message TEXT NOT NULL,status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',admin_note TEXT NOT NULL,reviewed_by BIGINT UNSIGNED NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TIMESTAMP NULL,INDEX idx_specialty_suggestions_status(status,created_at),CONSTRAINT fk_suggestion_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,CONSTRAINT fk_suggestion_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS listing_images (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,listing_id BIGINT UNSIGNED NOT NULL,storage_key VARCHAR(500) NOT NULL UNIQUE,mime_type VARCHAR(80) NOT NULL,width INT UNSIGNED NOT NULL,height INT UNSIGNED NOT NULL,alt_text VARCHAR(200) NOT NULL DEFAULT '',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_listing_images_listing(listing_id),CONSTRAINT fk_listing_images_listing FOREIGN KEY(listing_id) REFERENCES provider_listings(id) ON DELETE CASCADE) ENGINE=InnoDB`,
];

function alteredColumn(statement:string) {
  const match=/^ALTER TABLE ([a-z_]+) ADD COLUMN ([a-z_]+)/i.exec(statement);
  return match ? {table:match[1],column:match[2]} : null;
}

const specialtySeed = [
  ['acupuncture','Acupuncture','Acupuntura',1,'activity'],
  ['phytotherapy','Phytotherapy','Fitoterapia',1,'leaf'],
  ['homeopathy','Homeopathy','Homeopatia',1,'droplets'],
  ['traditional-chinese-medicine','Traditional Chinese Medicine','Medicina Tradicional Chinesa',1,'circle-dot'],
  ['naturopathy','Naturopathy','Naturopatia',1,'sprout'],
  ['osteopathy','Osteopathy','Osteopatia',1,'bone'],
  ['chiropractic','Chiropractic','Quiroprática',1,'accessibility'],
  ['ayurveda','Ayurveda','Ayurveda',0,'flower-2'],
  ['massage-therapy','Massage Therapy','Massoterapia',0,'hand'],
  ['reiki','Reiki','Reiki',0,'sparkles'],
  ['reflexology','Reflexology','Reflexologia',0,'footprints'],
  ['hypnotherapy','Hypnotherapy','Hipnoterapia',0,'waves'],
  ['yoga-therapy','Yoga Therapy','Terapia de Yoga',0,'person-standing'],
  ['sound-therapy','Sound Therapy','Terapia do Som',0,'audio-lines'],
  ['energy-work','Energy Work','Terapias Energéticas',0,'zap'],
  ['astrology','Astrology','Astrologia',0,'orbit'],
  ['tarot-reading','Tarot Reading','Leitura de Tarot',0,'gallery-vertical-end'],
  ['numerology','Numerology','Numerologia',0,'binary'],
  ['spiritual-counselling','Spiritual Counselling','Aconselhamento Espiritual',0,'heart-handshake'],
  ['meditation','Meditation','Meditação',0,'brain'],
  ['breathwork','Breathwork','Respiração Consciente',0,'wind'],
  ['sound-healing','Sound Healing','Cura pelo Som',0,'music'],
  ['holistic-nutrition','Holistic Nutrition','Nutrição Holística',0,'apple'],
  ['aromatherapy','Aromatherapy','Aromaterapia',0,'flask-conical'],
] as const;

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
    if (!await db.first('SELECT version FROM schema_migrations WHERE version=2')) {
      for (const statement of mysqlDirectoryStatements) await db.execute(statement);
      await db.execute("INSERT IGNORE INTO schema_migrations(version,name) VALUES(2,'annotations and moderated wellness directory')");
    }
    if (!await db.first('SELECT version FROM schema_migrations WHERE version=3')) {
      for (const statement of mysqlPlatformStatements) {
        const altered=alteredColumn(statement);
        if(altered&&await db.first('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?',[altered.table,altered.column]))continue;
        await db.execute(statement);
      }
      await db.execute("INSERT IGNORE INTO schema_migrations(version,name) VALUES(3,'account types analytics suggestions and listing media')");
    }
    for (const [slug,nameEn,namePt,regulated,iconKey] of specialtySeed) {
      await db.execute('INSERT INTO therapy_specialties(slug,name_en,name_pt,regulated,icon_key,sort_order) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name_en=VALUES(name_en),name_pt=VALUES(name_pt),regulated=VALUES(regulated),icon_key=VALUES(icon_key),sort_order=VALUES(sort_order)', [slug,nameEn,namePt,regulated,iconKey,specialtySeed.findIndex(item=>item[0]===slug)]);
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
    if (!await db.first('SELECT version FROM schema_migrations WHERE version=2')) {
      for (const statement of sqliteDirectoryStatements) await db.execute(statement);
      await db.execute("INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(2,'annotations and moderated wellness directory')");
    }
    if (!await db.first('SELECT version FROM schema_migrations WHERE version=3')) {
      for (const statement of sqlitePlatformStatements) {
        const altered=alteredColumn(statement);
        if(altered){
          const columns=sqlite.prepare(`PRAGMA table_info(${altered.table})`).all() as {name:string}[];
          if(columns.some(column=>column.name===altered.column))continue;
        }
        await db.execute(statement);
      }
      await db.execute("INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(3,'account types analytics suggestions and listing media')");
    }
    for (const [slug,nameEn,namePt,regulated,iconKey] of specialtySeed) {
      await db.execute(`INSERT INTO therapy_specialties(slug,name_en,name_pt,regulated,icon_key,sort_order) VALUES(?,?,?,?,?,?)
        ON CONFLICT(slug) DO UPDATE SET name_en=excluded.name_en,name_pt=excluded.name_pt,regulated=excluded.regulated,icon_key=excluded.icon_key,sort_order=excluded.sort_order`, [slug,nameEn,namePt,regulated,iconKey,specialtySeed.findIndex(item=>item[0]===slug)]);
    }
  }
  await db.execute('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP');
  await db.execute('DELETE FROM activity_events WHERE created_at < ?', [new Date(Date.now()-90*86400000).toISOString().slice(0,19).replace('T',' ')]);
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
