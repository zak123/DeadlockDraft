import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';
import { getConfig } from '../config/env';

const config = getConfig();

// Ensure data directory exists
const dbPath = config.databaseUrl;
const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));
if (dbDir) {
  await Bun.write(dbDir + '/.gitkeep', '');
}

const sqlite = new Database(dbPath);
sqlite.exec('PRAGMA journal_mode = WAL;');

export const db = drizzle(sqlite, { schema });

export * from './schema';
