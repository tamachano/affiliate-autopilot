import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AnalyticsSnapshot, Experiment, ExperimentJudgement, ExperimentStatus, ScoredProduct } from './types.js';

export function openDb(root: string) {
  const dir = path.join(root, 'db');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'affiliate-autopilot.sqlite'));
  db.exec(`
    PRAGMA journal_mode=WAL;

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      theme TEXT NOT NULL,
      created_at TEXT NOT NULL,
      output_dir TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_products (
      run_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      score REAL NOT NULL,
      price_yen INTEGER NOT NULL,
      claims_verified INTEGER NOT NULL,
      asset_permission_confirmed INTEGER NOT NULL,
      affiliate_url TEXT,
      PRIMARY KEY(run_id, rank)
    );

    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      theme TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      variables_changed_json TEXT NOT NULL,
      primary_metric TEXT NOT NULL,
      secondary_metrics_json TEXT NOT NULL,
      success_criteria TEXT NOT NULL,
      baseline_value REAL,
      target_value REAL,
      judgement TEXT NOT NULL,
      learning TEXT,
      next_action TEXT,
      youtube_video_id TEXT
    );

    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      platform TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      views INTEGER,
      engaged_views INTEGER,
      avg_view_duration_sec REAL,
      stayed_to_watch_pct REAL,
      likes INTEGER,
      subscribers_delta INTEGER,
      clicks INTEGER,
      conversions INTEGER,
      revenue_yen REAL
    );

    CREATE TABLE IF NOT EXISTS youtube_auth (
      id INTEGER PRIMARY KEY CHECK(id=1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      scope TEXT NOT NULL,
      token_type TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS experiment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supervisor_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      final_verdict TEXT NOT NULL,
      human_score REAL NOT NULL,
      overall_score REAL NOT NULL,
      iterations INTEGER NOT NULL,
      source TEXT NOT NULL,
      result_json TEXT NOT NULL
    );
  `);
  const cols = db.prepare("PRAGMA table_info(experiments)").all() as any[];
  if (!cols.some(c => String(c.name) === 'youtube_video_id')) {
    db.exec('ALTER TABLE experiments ADD COLUMN youtube_video_id TEXT');
  }

  // v0.4.4 guard migration: old exploratory experiments must not keep
  // affiliate_clicks + 20% improvement logic when no baseline exists.
  const oldRows = db.prepare(`
    SELECT id, variables_changed_json, primary_metric, secondary_metrics_json, success_criteria, baseline_value
    FROM experiments
  `).all() as any[];
  for (const row of oldRows) {
    let variables: string[] = [];
    let secondary: string[] = [];
    try { variables = JSON.parse(String(row.variables_changed_json || '[]')); } catch {}
    try { secondary = JSON.parse(String(row.secondary_metrics_json || '[]')); } catch {}
    const exploratory = row.baseline_value == null || variables.length > 1;
    if (!exploratory) continue;

    const primary = String(row.primary_metric || '');
    const criteria = String(row.success_criteria || '');
    const nextPrimary = !primary || primary === 'affiliate_clicks' ? 'stayed_to_watch_pct' : primary;
    const nextSecondary = Array.from(new Set([
      ...secondary.filter(Boolean),
      'avg_view_duration_sec',
      'affiliate_clicks',
      'conversions'
    ])).filter(x => x !== nextPrimary);
    const nextCriteria = (!criteria || /20%|20％|20%以上|直近の比較対象/.test(criteria))
      ? '探索実験: 初回コンバージョンが発生したら導線成立。未発生の場合は300再生未満では結論を出さず、視聴指標を次の統制実験のベースライン候補として保存する'
      : criteria;

    if (nextPrimary !== primary || nextCriteria !== criteria || JSON.stringify(nextSecondary) !== JSON.stringify(secondary)) {
      db.prepare(`
        UPDATE experiments
        SET primary_metric=?, secondary_metrics_json=?, success_criteria=?, updated_at=?
        WHERE id=?
      `).run(nextPrimary, JSON.stringify(nextSecondary), nextCriteria, new Date().toISOString(), String(row.id));
    }
  }
  return db;
}

export function saveRun(db: DatabaseSync, run: {id:string;theme:string;createdAt:string;outputDir:string;products:ScoredProduct[]}) {
  db.prepare('INSERT OR REPLACE INTO runs(id,theme,created_at,output_dir) VALUES(?,?,?,?)')
    .run(run.id, run.theme, run.createdAt, run.outputDir);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO run_products(
      run_id,rank,product_id,product_name,score,price_yen,claims_verified,asset_permission_confirmed,affiliate_url
    ) VALUES(?,?,?,?,?,?,?,?,?)
  `);
  run.products.forEach((p,i) => stmt.run(
    run.id, i+1, p.id, p.name, p.score, p.priceYen,
    p.claimsVerified ? 1 : 0,
    p.assetPermissionConfirmed ? 1 : 0,
    p.affiliateUrl
  ));
}

function rowToExperiment(row: any): Experiment {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    theme: String(row.theme),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    status: row.status as ExperimentStatus,
    hypothesis: String(row.hypothesis),
    variablesChanged: JSON.parse(String(row.variables_changed_json || '[]')),
    primaryMetric: String(row.primary_metric),
    secondaryMetrics: JSON.parse(String(row.secondary_metrics_json || '[]')),
    successCriteria: String(row.success_criteria),
    baselineValue: row.baseline_value == null ? null : Number(row.baseline_value),
    targetValue: row.target_value == null ? null : Number(row.target_value),
    judgement: row.judgement as ExperimentJudgement,
    learning: row.learning == null ? '' : String(row.learning),
    nextAction: row.next_action == null ? '' : String(row.next_action),
    youtubeVideoId: row.youtube_video_id == null ? null : String(row.youtube_video_id)
  };
}

export function createExperiment(db: DatabaseSync, experiment: Experiment) {
  db.prepare(`
    INSERT INTO experiments(
      id,run_id,theme,created_at,updated_at,status,hypothesis,variables_changed_json,
      primary_metric,secondary_metrics_json,success_criteria,baseline_value,target_value,
      judgement,learning,next_action
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    experiment.id,
    experiment.runId,
    experiment.theme,
    experiment.createdAt,
    experiment.updatedAt,
    experiment.status,
    experiment.hypothesis,
    JSON.stringify(experiment.variablesChanged),
    experiment.primaryMetric,
    JSON.stringify(experiment.secondaryMetrics),
    experiment.successCriteria,
    experiment.baselineValue ?? null,
    experiment.targetValue ?? null,
    experiment.judgement,
    experiment.learning ?? '',
    experiment.nextAction ?? ''
  );
  addEvent(db, experiment.id, 'experiment_created', experiment);
}

export function listExperiments(db: DatabaseSync, limit = 30): Experiment[] {
  const rows = db.prepare('SELECT * FROM experiments ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(rowToExperiment);
}

export function getExperiment(db: DatabaseSync, id: string): Experiment | null {
  const row = db.prepare('SELECT * FROM experiments WHERE id = ?').get(id) as any;
  return row ? rowToExperiment(row) : null;
}

export function getExperimentByRunId(db: DatabaseSync, runId: string): Experiment | null {
  const row = db.prepare('SELECT * FROM experiments WHERE run_id = ?').get(runId) as any;
  return row ? rowToExperiment(row) : null;
}

export function updateExperimentPlanning(db: DatabaseSync, id: string, patch: {
  hypothesis: string;
  variablesChanged: string[];
  primaryMetric: string;
  secondaryMetrics: string[];
  successCriteria: string;
  baselineValue?: number | null;
  targetValue?: number | null;
  status?: ExperimentStatus;
}) {
  if (patch.variablesChanged.length > 2) throw new Error('1実験で変更できる変数は2つまでです。');
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE experiments SET
      updated_at=?, hypothesis=?, variables_changed_json=?, primary_metric=?, secondary_metrics_json=?,
      success_criteria=?, baseline_value=?, target_value=?, status=?
    WHERE id=?
  `).run(
    now,
    patch.hypothesis,
    JSON.stringify(patch.variablesChanged),
    patch.primaryMetric,
    JSON.stringify(patch.secondaryMetrics),
    patch.successCriteria,
    patch.baselineValue ?? null,
    patch.targetValue ?? null,
    patch.status ?? 'planning',
    id
  );
  addEvent(db, id, 'planning_updated', patch);
}

export function updateExperimentStatus(db: DatabaseSync, id: string, status: ExperimentStatus) {
  const now = new Date().toISOString();
  db.prepare('UPDATE experiments SET status=?, updated_at=? WHERE id=?').run(status, now, id);
  addEvent(db, id, 'status_changed', { status });
}

export function saveAnalytics(db: DatabaseSync, snapshot: AnalyticsSnapshot) {
  db.prepare(`
    INSERT INTO analytics_snapshots(
      experiment_id,stage,platform,captured_at,views,engaged_views,avg_view_duration_sec,stayed_to_watch_pct,
      likes,subscribers_delta,clicks,conversions,revenue_yen
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    snapshot.experimentId,
    snapshot.stage,
    snapshot.platform,
    snapshot.capturedAt,
    snapshot.views ?? null,
    snapshot.engagedViews ?? null,
    snapshot.avgViewDurationSec ?? null,
    snapshot.stayedToWatchPct ?? null,
    snapshot.likes ?? null,
    snapshot.subscribersDelta ?? null,
    snapshot.clicks ?? null,
    snapshot.conversions ?? null,
    snapshot.revenueYen ?? null
  );
  addEvent(db, snapshot.experimentId, 'analytics_saved', snapshot);
}

export function getAnalytics(db: DatabaseSync, experimentId: string): AnalyticsSnapshot[] {
  const rows = db.prepare('SELECT * FROM analytics_snapshots WHERE experiment_id=? ORDER BY captured_at ASC').all(experimentId) as any[];
  return rows.map(row => ({
    experimentId: String(row.experiment_id),
    stage: row.stage,
    platform: row.platform,
    capturedAt: String(row.captured_at),
    views: row.views == null ? null : Number(row.views),
    engagedViews: row.engaged_views == null ? null : Number(row.engaged_views),
    avgViewDurationSec: row.avg_view_duration_sec == null ? null : Number(row.avg_view_duration_sec),
    stayedToWatchPct: row.stayed_to_watch_pct == null ? null : Number(row.stayed_to_watch_pct),
    likes: row.likes == null ? null : Number(row.likes),
    subscribersDelta: row.subscribers_delta == null ? null : Number(row.subscribers_delta),
    clicks: row.clicks == null ? null : Number(row.clicks),
    conversions: row.conversions == null ? null : Number(row.conversions),
    revenueYen: row.revenue_yen == null ? null : Number(row.revenue_yen)
  }));
}


export function setExperimentYouTubeVideo(db: DatabaseSync, id: string, videoId: string | null) {
  const now = new Date().toISOString();
  db.prepare('UPDATE experiments SET youtube_video_id=?, updated_at=? WHERE id=?').run(videoId, now, id);
  addEvent(db, id, 'youtube_video_linked', { videoId });
}

export function saveJudgement(db: DatabaseSync, id: string, judgement: ExperimentJudgement, learning: string, nextAction: string) {
  const now = new Date().toISOString();
  db.prepare(`UPDATE experiments SET judgement=?, learning=?, next_action=?, status='closed', updated_at=? WHERE id=?`)
    .run(judgement, learning, nextAction, now, id);
  addEvent(db, id, 'judgement_saved', { judgement, learning, nextAction });
}

export function getRecentClosedExperiments(db: DatabaseSync, limit = 5): Experiment[] {
  const rows = db.prepare(`SELECT * FROM experiments WHERE status='closed' ORDER BY updated_at DESC LIMIT ?`).all(limit) as any[];
  return rows.map(rowToExperiment);
}

export function addEvent(db: DatabaseSync, experimentId: string, eventType: string, payload: unknown) {
  db.prepare('INSERT INTO experiment_events(experiment_id,event_type,created_at,payload_json) VALUES(?,?,?,?)')
    .run(experimentId, eventType, new Date().toISOString(), JSON.stringify(payload));
}


export function saveSupervisorRun(db: DatabaseSync, experimentId: string, result: any) {
  const last = result?.iterations?.[result.iterations.length - 1] || {};
  db.prepare(`INSERT INTO supervisor_runs(experiment_id,created_at,final_verdict,human_score,overall_score,iterations,source,result_json) VALUES(?,?,?,?,?,?,?,?)`)
    .run(experimentId, new Date().toISOString(), String(result?.finalVerdict || 'UNKNOWN'), Number(last?.humanScore || 0), Number(last?.overallScore || 0), Number(result?.iterations?.length || 0), String(last?.source || 'local'), JSON.stringify(result));
  addEvent(db, experimentId, 'supervisor_completed', { finalVerdict: result?.finalVerdict, humanScore: last?.humanScore, overallScore: last?.overallScore, iterations: result?.iterations?.length });
}

export function getSupervisorRuns(db: DatabaseSync, experimentId: string, limit = 10) {
  const rows = db.prepare('SELECT * FROM supervisor_runs WHERE experiment_id=? ORDER BY id DESC LIMIT ?').all(experimentId, limit) as any[];
  return rows.map(row => ({
    id:Number(row.id), experimentId:String(row.experiment_id), createdAt:String(row.created_at), finalVerdict:String(row.final_verdict),
    humanScore:Number(row.human_score), overallScore:Number(row.overall_score), iterations:Number(row.iterations), source:String(row.source),
    result: JSON.parse(String(row.result_json || '{}'))
  }));
}
