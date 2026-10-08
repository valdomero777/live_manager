import type { Generated } from 'kysely';

/** Kysely table types; mirror migrations/*.sql. */
export interface Database {
  live_session: {
    id: Generated<number>;
    tiktok_user: string;
    started_at: number;
    ended_at: number | null;
  };
  viewer: {
    id: Generated<number>;
    tiktok_user_id: string;
    unique_id: string;
    nickname: string | null;
    avatar_url: string | null;
    is_follower: number;
    is_subscriber: number;
    is_moderator: number;
    updated_at: number;
  };
  live_event: {
    id: Generated<number>;
    event_uid: string;
    session_id: number;
    viewer_id: number | null;
    type: string;
    payload: string;
    dedupe_key: string | null;
    occurred_at: number;
  };
  rule: {
    id: Generated<number>;
    name: string;
    trigger: string;
    conditions: string;
    actions: string;
    mode: string;
    cooldown_ms: number;
    user_cooldown_ms: number;
    probability: number;
    priority: number;
    enabled: number;
    version: Generated<number>;
  };
  asset: {
    id: Generated<number>;
    kind: string;
    filename: string;
    sha256: string;
    original_name: Generated<string>;
    size_bytes: Generated<number>;
    duration_ms: number | null;
    created_at: number;
  };
  sound_trigger: {
    id: Generated<number>;
    name: string;
    event: string;
    sound_id: string;
    sound_title: string;
    sound_url: string;
    sound_page_url: string;
    source: string;
    volume: number;
    enabled: number;
    created_at: number;
    updated_at: number;
  };
  leaderboard_total: {
    viewer_id: number;
    scope: string;
    metric: string;
    value: number;
  };
  metric_total: {
    scope: string;
    metric: string;
    value: number;
  };
  goal: {
    id: Generated<number>;
    name: string;
    metric: string;
    target: number;
    scope: string;
    on_reach: string | null;
    repeat_factor: number | null;
    active: number;
  };
  goal_cycle: {
    goal_id: number;
    scope_key: string;
    cycle: number;
    reached_at: number;
  };
  app_setting: {
    key: string;
    value: string;
  };
  schema_migration: {
    name: string;
    applied_at: number;
  };
}
