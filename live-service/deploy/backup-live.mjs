#!/usr/bin/env node
// Create a consistent SQLite snapshot without stopping the Live service.
// Credentials inside the database remain encrypted; the master key is stored
// separately and is deliberately not included in the backup.
import {DatabaseSync} from 'node:sqlite';
import {chmodSync, mkdirSync, readdirSync, statSync, unlinkSync} from 'node:fs';
import {join} from 'node:path';

const dataDir = process.env.JAMDDMAJ_LIVE_DATA_DIR || '/var/lib/jamddmaj-live';
const dbPath = join(dataDir, 'live.sqlite');
const backupDir = join(dataDir, 'backups');
const keep = Math.max(2, Math.min(30, Number(process.env.JAMDDMAJ_LIVE_BACKUP_KEEP || 7)));
mkdirSync(backupDir, {recursive: true, mode: 0o700});
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(backupDir, `live-${stamp}.sqlite`);
const escaped = target.replaceAll("'", "''");

const db = new DatabaseSync(dbPath, {timeout: 10000});
try {
  db.exec(`VACUUM INTO '${escaped}'`);
} finally {
  db.close();
}
chmodSync(target, 0o600);
const size = statSync(target).size;
if (size < 4096) {
  try { unlinkSync(target); } catch {}
  throw new Error('LIVE_BACKUP_TOO_SMALL');
}
const files = readdirSync(backupDir).filter(name => /^live-.*\.sqlite$/.test(name))
  .map(name => ({name, at: statSync(join(backupDir, name)).mtimeMs}))
  .sort((a, b) => b.at - a.at);
for (const old of files.slice(keep)) {
  try { unlinkSync(join(backupDir, old.name)); } catch {}
}
console.log(JSON.stringify({ok: true, backup: target, bytes: size, retained: Math.min(files.length, keep)}));
