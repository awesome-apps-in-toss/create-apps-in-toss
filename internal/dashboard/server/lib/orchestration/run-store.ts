import path from 'path';
import { promises as fs } from 'fs';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { HistoricRunEvent, RunEvent, RunState } from './run-session.js';

export interface PersistedRunRow {
  runId: string;
  skill: string;
  appName: string | null;
  initialPrompt: string;
  idempotencyKey: string | null;
  state: RunState;
  exitCode: number | null;
  startedAt: string;
  endedAt: string | null;
  cwd: string;
}

export interface RunListFilter {
  appName?: string | null;
  skill?: string | null;
  state?: RunState | null;
  limit?: number;
}

export class RunStore {
  private db: DatabaseType;
  private insertRunStmt: Database.Statement;
  private updateStateStmt: Database.Statement;
  private getRunStmt: Database.Statement;
  private listRunsStmt: Database.Statement;
  private deleteRunStmt: Database.Statement;
  private insertEventStmt: Database.Statement;
  private listEventsStmt: Database.Statement;
  private latestSuccessStmt: Database.Statement;
  private markOrphansStmt: Database.Statement;

  constructor(db: DatabaseType) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();

    this.insertRunStmt = this.db.prepare(`
      INSERT INTO runs (
        runId, skill, appName, initialPrompt, idempotencyKey,
        state, exitCode, startedAt, endedAt, cwd
      ) VALUES (
        @runId, @skill, @appName, @initialPrompt, @idempotencyKey,
        @state, @exitCode, @startedAt, @endedAt, @cwd
      )
    `);
    this.updateStateStmt = this.db.prepare(`
      UPDATE runs SET state = @state, exitCode = @exitCode, endedAt = @endedAt
      WHERE runId = @runId
    `);
    this.getRunStmt = this.db.prepare(`SELECT * FROM runs WHERE runId = ?`);
    this.listRunsStmt = this.db.prepare(`
      SELECT * FROM runs
      WHERE (@appName IS NULL OR appName = @appName)
        AND (@skill IS NULL OR skill = @skill)
        AND (@state IS NULL OR state = @state)
      ORDER BY startedAt DESC
      LIMIT @limit
    `);
    this.deleteRunStmt = this.db.prepare(`DELETE FROM runs WHERE runId = ?`);
    this.insertEventStmt = this.db.prepare(`
      INSERT OR IGNORE INTO events (runId, seq, kind, data, at)
      VALUES (@runId, @seq, @kind, @data, @at)
    `);
    this.listEventsStmt = this.db.prepare(`
      SELECT seq, kind, data, at FROM events WHERE runId = ? ORDER BY seq ASC
    `);
    this.latestSuccessStmt = this.db.prepare(`
      SELECT * FROM runs
      WHERE skill = @skill
        AND (@appName IS NULL AND appName IS NULL OR appName = @appName)
        AND (@idempotencyKey IS NULL AND idempotencyKey IS NULL OR idempotencyKey = @idempotencyKey)
        AND state = 'COMPLETED'
      ORDER BY startedAt DESC
      LIMIT 1
    `);
    this.markOrphansStmt = this.db.prepare(`
      UPDATE runs
      SET state = 'FAILED', endedAt = @endedAt, exitCode = -1
      WHERE state IN ('RUNNING', 'WAITING_USER_INPUT', 'READY', 'VALIDATING_INPUT', 'DRAFT')
    `);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        runId          TEXT PRIMARY KEY,
        skill          TEXT NOT NULL,
        appName        TEXT,
        initialPrompt  TEXT NOT NULL DEFAULT '',
        idempotencyKey TEXT,
        state          TEXT NOT NULL,
        exitCode       INTEGER,
        startedAt      TEXT NOT NULL,
        endedAt        TEXT,
        cwd            TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runs_app_skill ON runs (appName, skill);
      CREATE INDEX IF NOT EXISTS idx_runs_state ON runs (state);
      CREATE INDEX IF NOT EXISTS idx_runs_startedAt ON runs (startedAt DESC);

      CREATE TABLE IF NOT EXISTS events (
        runId TEXT NOT NULL,
        seq   INTEGER NOT NULL,
        kind  TEXT NOT NULL,
        data  TEXT NOT NULL,
        at    TEXT NOT NULL,
        PRIMARY KEY (runId, seq),
        FOREIGN KEY (runId) REFERENCES runs(runId) ON DELETE CASCADE
      );
    `);
  }

  insertRun(row: PersistedRunRow): void {
    this.insertRunStmt.run(row);
  }

  updateState(runId: string, state: RunState, exitCode: number | null, endedAt: string | null): void {
    this.updateStateStmt.run({ runId, state, exitCode, endedAt });
  }

  getRun(runId: string): PersistedRunRow | null {
    const row = this.getRunStmt.get(runId) as PersistedRunRow | undefined;
    return row ?? null;
  }

  listRuns(filter: RunListFilter = {}): PersistedRunRow[] {
    return this.listRunsStmt.all({
      appName: filter.appName ?? null,
      skill: filter.skill ?? null,
      state: filter.state ?? null,
      limit: filter.limit ?? 200,
    }) as PersistedRunRow[];
  }

  deleteRun(runId: string): void {
    this.deleteRunStmt.run(runId);
  }

  appendEvent(runId: string, event: HistoricRunEvent): void {
    this.insertEventStmt.run({
      runId,
      seq: event.seq,
      kind: event.kind,
      data: JSON.stringify(event.data ?? null),
      at: event.at,
    });
  }

  listEvents(runId: string): HistoricRunEvent[] {
    const rows = this.listEventsStmt.all(runId) as Array<{
      seq: number;
      kind: string;
      data: string;
      at: string;
    }>;
    return rows.map((r) => ({
      seq: r.seq,
      kind: r.kind as RunEvent['kind'],
      data: safeParseJSON(r.data),
      at: r.at,
    }));
  }

  /**
   * 같은 (skill, appName, idempotencyKey) 조합에서 가장 최근 COMPLETED 기록.
   * idempotencyKey가 null이면 (skill, appName) 기준으로 조회.
   */
  findLatestSuccess(args: {
    skill: string;
    appName: string | null;
    idempotencyKey: string | null;
  }): PersistedRunRow | null {
    const row = this.latestSuccessStmt.get(args) as PersistedRunRow | undefined;
    return row ?? null;
  }

  /**
   * 서버 재기동 시점에 고아가 된 runs (RUNNING 등)을 FAILED로 일괄 정리.
   * child 프로세스가 사라졌기 때문에 복원 불가 → 기록만 남기고 터미널화한다.
   */
  markOrphansFailed(now: string = new Date().toISOString()): number {
    const res = this.markOrphansStmt.run({ endedAt: now });
    return res.changes;
  }

  close(): void {
    this.db.close();
  }
}

function safeParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

let sharedStore: RunStore | null = null;

/**
 * 기본 SQLite 위치는 internal/dashboard/data/runs.db.
 * 테스트에서 다른 위치 쓰고 싶으면 openRunStore(path) 로 직접 인스턴스화.
 */
export async function getDefaultRunStore(): Promise<RunStore> {
  if (sharedStore) return sharedStore;
  const dataDir = path.resolve(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'runs.db');
  sharedStore = openRunStore(dbPath);
  return sharedStore;
}

export function openRunStore(dbPath: string): RunStore {
  const db = new Database(dbPath);
  return new RunStore(db);
}

/** 테스트·재초기화용. */
export function resetDefaultRunStore(): void {
  if (sharedStore) {
    sharedStore.close();
    sharedStore = null;
  }
}
