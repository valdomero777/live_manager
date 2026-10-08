import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { runMigrations } from '../src/infrastructure/sqlite/migrator.js';
import { SqliteEventStore } from '../src/infrastructure/sqlite/sqlite-event-store.js';
import { SqliteRuleRepository } from '../src/infrastructure/sqlite/sqlite-rule-repository.js';
import { SqliteSessionRepository } from '../src/infrastructure/sqlite/sqlite-session-repository.js';
import { RuleDefinitionSchema } from '@tiklive/contracts';
import { aCommentEvent, aGiftEvent, aViewer, save } from './support/builders.js';

function setup() {
  const handle = openDatabase(':memory:');
  runMigrations(handle.sqlite);
  return handle;
}

describe('migrations', () => {
  it('applies once and is idempotent on restart', () => {
    const { sqlite } = setup();
    expect(runMigrations(sqlite)).toEqual([]);
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(tables.map((t) => (t as { name: string }).name)).toEqual(
      expect.arrayContaining(['live_session', 'viewer', 'live_event', 'rule', 'leaderboard_total']),
    );
  });
});

describe('SqliteEventStore', () => {
  it('persists an event and upserts its viewer (RNF-06)', async () => {
    const { db, sqlite } = setup();
    const session = await new SqliteSessionRepository(db).start('alan', 1);
    const store = new SqliteEventStore(sqlite);

    expect(
      await save(store, aGiftEvent({ id: 'e1', sessionId: session.id, dedupeKey: 'm1' })),
    ).toBe(true);
    const renamed = aViewer({ nickname: 'Renamed' });
    expect(
      await save(store, aCommentEvent({ id: 'e2', sessionId: session.id, viewer: renamed })),
    ).toBe(true);

    const viewers = await db.selectFrom('viewer').selectAll().execute();
    expect(viewers).toHaveLength(1);
    expect(viewers[0]?.nickname).toBe('Renamed');
    const events = await db.selectFrom('live_event').select(['type', 'viewer_id']).execute();
    expect(events).toEqual([
      { type: 'gift', viewer_id: viewers[0]?.id },
      { type: 'comment', viewer_id: viewers[0]?.id },
    ]);
  });

  it('given the same dedupe key after a restart, when saved, then reports a duplicate', async () => {
    const { db, sqlite } = setup();
    const session = await new SqliteSessionRepository(db).start('alan', 1);
    const store = new SqliteEventStore(sqlite);
    await save(store, aGiftEvent({ id: 'e1', sessionId: session.id, dedupeKey: 'm1' }));
    expect(
      await save(store, aGiftEvent({ id: 'e2', sessionId: session.id, dedupeKey: 'm1' })),
    ).toBe(false);
  });
});

describe('SqliteSessionRepository', () => {
  it('closes dangling sessions left by a crash', async () => {
    const { db } = setup();
    const repo = new SqliteSessionRepository(db);
    await repo.start('a', 1);
    await repo.start('b', 2);
    expect(await repo.closeDangling(10)).toBe(2);
    expect(await repo.closeDangling(11)).toBe(0);
  });
});

describe('SqliteRuleRepository', () => {
  const definition = RuleDefinitionSchema.parse({
    name: 'Rosa grande',
    trigger: 'gift',
    conditions: [{ type: 'giftName', op: 'eq', value: 'Rose' }],
    actions: [{ type: 'showAlert', text: 'hola' }],
  });

  it('round-trips rules and bumps the version on update', async () => {
    const { db } = setup();
    const repo = new SqliteRuleRepository(db);
    const created = await repo.create(definition);
    expect(created).toMatchObject({ id: 1, version: 1, name: 'Rosa grande', enabled: true });

    const updated = await repo.update(created.id, { ...definition, name: 'Otra' });
    expect(updated).toMatchObject({ version: 2, name: 'Otra' });
    await repo.setEnabled(created.id, false);
    expect((await repo.findById(created.id))?.enabled).toBe(false);
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.listAll()).toEqual([]);
  });

  it('skips and reports a corrupt row instead of failing the whole list', async () => {
    const { db, sqlite } = setup();
    const corrupt: number[] = [];
    const repo = new SqliteRuleRepository(db, (id) => corrupt.push(id));
    await repo.create(definition);
    sqlite
      .prepare(
        "INSERT INTO rule (name, trigger, conditions, actions) VALUES ('bad', 'gift', '[]', '{oops')",
      )
      .run();
    expect(await repo.listAll()).toHaveLength(1);
    expect(corrupt).toEqual([2]);
  });
});
