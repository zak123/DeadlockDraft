import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';

const dbPath = process.env.DATABASE_URL || './data/deadlock-draft.db';

// Ensure data directory exists
const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));
if (dbDir) {
  const fs = await import('fs');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

console.log('Running migrations...');

migrate(db, { migrationsFolder: './src/db/migrations' });

console.log('Migrations complete!');

sqlite.close();
