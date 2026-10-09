/**
 * Restores the database from a backup. STOP THE SERVER FIRST.
 *
 *   npm run restore -- data/backups/app-20261008T040000Z.db [--db ./data/app.db]
 *   node apps\server\dist\main\restore.js <backup> --db C:\TikLive\data\app.db   (deployed)
 *
 * The current database is kept as "<db>.before-restore". Migrations run on the next start.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { restoreDatabase } from '../infrastructure/sqlite/restore.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { db: { type: 'string', default: process.env['DB_PATH'] ?? './data/app.db' } },
});
const backup = positionals[0];
if (!backup) {
  process.stderr.write('Uso: npm run restore -- <archivo de respaldo> [--db <ruta>]\n');
  process.exit(1);
}
try {
  const safety = restoreDatabase(resolve(backup), resolve(values.db));
  process.stdout.write(
    `Restaurado ${backup} -> ${values.db}` +
      (safety ? `\nCopia anterior guardada en ${safety}\n` : '\n'),
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
