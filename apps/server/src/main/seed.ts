/**
 * Seed data for development (`npm run seed`): a generated "ding" sound and example rules that
 * exercise sound, alert and TTS. Safe to run twice: existing assets/rules are not duplicated.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDing } from './ding.js';
import {
  GoalDefinitionSchema,
  RuleDefinitionSchema,
  type RuleDefinitionInput,
} from '@tiklive/contracts';
import type { Kysely } from 'kysely';
import { openDatabase } from '../infrastructure/sqlite/database.js';
import { runMigrations } from '../infrastructure/sqlite/migrator.js';
import type { Database } from '../infrastructure/sqlite/schema.js';
import { SqliteAssetRepository } from '../infrastructure/sqlite/sqlite-asset-repository.js';
import { SqliteGoalRepository } from '../infrastructure/sqlite/sqlite-goal-repository.js';
import { SqliteRuleRepository } from '../infrastructure/sqlite/sqlite-rule-repository.js';

function exampleRules(dingId: number): RuleDefinitionInput[] {
  return [
    {
      name: 'Regalo: sonido + alerta',
      trigger: 'gift',
      priority: 50,
      actions: [
        { type: 'playSound', assetId: dingId, volume: 0.8 },
        { type: 'showAlert', text: '{nickname} envió {quantity} × {giftName}', durationMs: 5000 },
        { type: 'speak', text: 'Gracias {nickname} por {quantity} {giftName}' },
      ],
    },
    {
      name: 'Nuevo seguidor',
      trigger: 'follow',
      priority: 30,
      cooldownMs: 3000,
      actions: [{ type: 'showAlert', text: '¡{nickname} ahora te sigue!', durationMs: 4000 }],
    },
    {
      name: 'Cada 100 likes',
      trigger: 'like',
      priority: 10,
      conditions: [{ type: 'likesCumulative', mode: 'every', value: 100 }],
      actions: [{ type: 'playSound', assetId: dingId, volume: 0.5 }],
    },
    {
      name: 'Leer comandos !di',
      trigger: 'comment',
      priority: 20,
      userCooldownMs: 10_000,
      conditions: [{ type: 'keyword', match: 'startsWith', value: '!di ' }],
      actions: [{ type: 'speak', text: '{nickname} dice {commandArgs}' }],
    },
  ];
}

/** A repeating diamonds goal (100, 200, 400...) that celebrates with sound and an alert. */
async function seedGoal(db: Kysely<Database>, dingId: number): Promise<void> {
  const goals = new SqliteGoalRepository(db);
  if ((await goals.listAll()).length > 0) return;
  await goals.create(
    GoalDefinitionSchema.parse({
      name: 'Meta de diamantes',
      metric: 'diamonds',
      target: 100,
      repeatFactor: 2,
      onReach: [
        { type: 'playSound', assetId: dingId, volume: 1 },
        { type: 'showAlert', text: '¡{goalName} nivel {cycle} cumplida!', durationMs: 6000 },
      ],
    }),
  );
}

async function seed(): Promise<void> {
  const dbPath = process.env['DB_PATH'] ?? './data/app.db';
  const assetsDir = process.env['ASSETS_DIR'] ?? './data/assets';
  mkdirSync(assetsDir, { recursive: true });
  const handle = openDatabase(dbPath);
  const { db, sqlite } = handle;
  runMigrations(sqlite);

  const wav = generateDing();
  const sha256 = createHash('sha256').update(wav).digest('hex');
  const filename = `${sha256.slice(0, 16)}.wav`;
  writeFileSync(join(assetsDir, filename), wav);
  const assets = new SqliteAssetRepository(db);
  const ding =
    (await assets.findBySha(sha256)) ??
    (await assets.create({
      kind: 'audio',
      filename,
      sha256,
      originalName: 'ding.wav',
      sizeBytes: wav.byteLength,
      durationMs: 600,
      createdAt: Date.now(),
    }));

  const rules = new SqliteRuleRepository(db);
  const existing = new Set((await rules.listAll()).map((r) => r.name));
  for (const input of exampleRules(ding.id)) {
    if (!existing.has(input.name)) await rules.create(RuleDefinitionSchema.parse(input));
  }
  await seedGoal(db, ding.id);
  process.stdout.write(`seeded asset #${ding.id} (${filename}), rules and goal into ${dbPath}\n`);
  await handle.close();
}

await seed();
