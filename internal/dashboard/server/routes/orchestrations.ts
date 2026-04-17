import { Router } from 'express';
import path from 'path';
import {
  RunSession,
  runSessions,
  type HistoricRunEvent,
  type RunState,
} from '../lib/orchestration/run-session.js';
import { getDefaultRunStore, type PersistedRunRow } from '../lib/orchestration/run-store.js';
import { readSkillMeta } from '../lib/skills-meta.js';

const router: Router = Router();
const REPO_ROOT = path.resolve(process.cwd(), '../../');
const APPS_DIR = path.join(REPO_ROOT, 'apps');

// 앱 ID 검증 (경로 탈출 방지)
const APP_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
function validateAppId(id: string | undefined): id is string {
  return !!id && APP_ID_RE.test(id) && !id.includes('..');
}

/**
 * 스킬 id에 따라 실행 cwd를 결정.
 *   - ait-scaffold, ait-launch: 모노레포 루트 (앱을 생성·총괄)
 *   - 그 외: apps/<appName>
 */
function resolveCwd(skill: string, appName: string | undefined): string | null {
  if (skill === 'ait-scaffold' || skill === 'ait-launch') return REPO_ROOT;
  if (!appName) return null;
  return path.join(APPS_DIR, appName);
}

function needsAppName(skill: string): boolean {
  return skill !== 'ait-scaffold' && skill !== 'ait-launch';
}

function liveSummary(session: RunSession) {
  return {
    runId: session.runId,
    skill: session.skill,
    appName: session.appName ?? null,
    state: session.state,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? null,
    exitCode: session.exitCode ?? null,
  };
}

function persistedSummary(row: PersistedRunRow) {
  return {
    runId: row.runId,
    skill: row.skill,
    appName: row.appName,
    state: row.state,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    exitCode: row.exitCode,
  };
}

async function attachStore(session: RunSession): Promise<void> {
  const store = await getDefaultRunStore();
  store.insertRun({
    runId: session.runId,
    skill: session.skill,
    appName: session.appName ?? null,
    initialPrompt: session.initialPrompt,
    idempotencyKey: session.idempotencyKey ?? null,
    state: session.state,
    exitCode: session.exitCode ?? null,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? null,
    cwd: session.cwd,
  });
  session.addListener(
    (event: HistoricRunEvent) => {
      try {
        store.appendEvent(session.runId, event);
        if (event.kind === 'state' || event.kind === 'done') {
          store.updateState(
            session.runId,
            session.state,
            session.exitCode ?? null,
            session.endedAt ?? null
          );
        }
      } catch (err) {
        console.warn('[run-store] persistence failed', err);
      }
    },
    { replay: true }
  );
}

// POST /api/orchestrations
// Body: {
//   skill: string,            // pipeline skill id (frontmatter에 step 필요)
//   appName?: string,         // scaffold/launch 외에는 필수
//   input?: {
//     idea?: string,          // legacy (ait-plan)
//     prompt?: string,        // 일반 프롬프트 오버라이드
//   },
//   idempotencyKey?: string,  // 선택 — 같은 키 성공 기록이 있으면 후속 stage에서 스킵
//   resume?: boolean,         // true 면 같은 (skill,appName,key)의 최근 COMPLETED 기록을 그대로 반환
// }
router.post('/', async (req, res) => {
  const body = req.body as {
    skill?: unknown;
    appName?: unknown;
    input?: { idea?: unknown; prompt?: unknown };
    idempotencyKey?: unknown;
    resume?: unknown;
  };

  const skillId =
    typeof body.skill === 'string' && body.skill.trim() ? body.skill.trim() : 'ait-plan';
  const meta = await readSkillMeta(skillId);
  if (!meta) {
    res.status(400).json({ error: `Unknown skill: ${skillId}` });
    return;
  }
  if (meta.step === null) {
    res.status(400).json({ error: `${skillId} is not a pipeline skill (no step in frontmatter)` });
    return;
  }

  const rawAppName = typeof body.appName === 'string' ? body.appName.trim() : '';
  const appName = rawAppName.length > 0 ? rawAppName : undefined;
  if (appName !== undefined && !validateAppId(appName)) {
    res.status(400).json({ error: 'Invalid appName (only [a-z0-9._-] allowed)' });
    return;
  }
  if (needsAppName(skillId) && !appName) {
    res.status(400).json({ error: `appName required for skill ${skillId}` });
    return;
  }

  const cwd = resolveCwd(skillId, appName);
  if (!cwd) {
    res.status(400).json({ error: 'Unable to resolve cwd' });
    return;
  }

  const idea = body.input?.idea;
  const promptOverride = body.input?.prompt;
  const initialPrompt = (
    typeof promptOverride === 'string' ? promptOverride : typeof idea === 'string' ? idea : ''
  ).trim();

  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : meta.idempotencyKey;

  const resume = body.resume === true;
  if (resume) {
    const store = await getDefaultRunStore();
    const existing = store.findLatestSuccess({
      skill: skillId,
      appName: appName ?? null,
      idempotencyKey: idempotencyKey ?? null,
    });
    if (existing) {
      res.status(200).json({
        ...persistedSummary(existing),
        reused: true,
      });
      return;
    }
  }

  const session = new RunSession({
    skill: skillId,
    cwd,
    initialPrompt,
    ...(appName !== undefined && { appName }),
    ...(idempotencyKey !== undefined && { idempotencyKey }),
  });
  runSessions.set(session.runId, session);
  await attachStore(session);

  res.status(201).json({ ...liveSummary(session), reused: false });
});

// GET /api/orchestrations
// Query: ?app=<id>&skill=<id>&state=<state>&limit=<n>
router.get('/', async (req, res) => {
  const appFilter = typeof req.query['app'] === 'string' ? req.query['app'] : null;
  const skillFilter = typeof req.query['skill'] === 'string' ? req.query['skill'] : null;
  const stateFilter =
    typeof req.query['state'] === 'string' ? (req.query['state'] as RunState) : null;
  const limitRaw = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : NaN;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 200;

  const store = await getDefaultRunStore();
  const rows = store.listRuns({
    appName: appFilter,
    skill: skillFilter,
    state: stateFilter,
    limit,
  });

  res.json({ runs: rows.map(persistedSummary) });
});

// GET /api/orchestrations/:runId
router.get('/:runId', async (req, res) => {
  const runId = req.params['runId'];
  if (!runId) {
    res.status(400).json({ error: 'runId required' });
    return;
  }
  const live = runSessions.get(runId);
  const store = await getDefaultRunStore();
  const row = store.getRun(runId);

  if (!live && !row) {
    res.status(404).json({ error: 'run not found' });
    return;
  }

  const history = live ? [...live.getHistory()] : store.listEvents(runId);
  const base = live
    ? {
        ...liveSummary(live),
        initialPrompt: live.initialPrompt,
        idempotencyKey: live.idempotencyKey ?? null,
      }
    : {
        ...persistedSummary(row!),
        initialPrompt: row!.initialPrompt,
        idempotencyKey: row!.idempotencyKey,
      };

  res.json({ ...base, history });
});

// GET /api/orchestrations/:runId/stream → SSE
router.get('/:runId/stream', (req, res) => {
  const runId = req.params['runId'];
  const session = runId ? runSessions.get(runId) : undefined;
  if (!session) {
    res.status(404).json({ error: 'run not found or already terminated' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const replay = req.query['replay'] !== 'false';
  session.addClient(res, { replay });
});

// POST /api/orchestrations/:runId/input
// Body: { text: string }
router.post('/:runId/input', (req, res) => {
  const runId = req.params['runId'];
  const session = runId ? runSessions.get(runId) : undefined;
  if (!session) {
    res.status(404).json({ error: 'run not found' });
    return;
  }
  const body = req.body as { text?: unknown };
  if (typeof body.text !== 'string') {
    res.status(400).json({ error: 'text (string) required' });
    return;
  }
  const result = session.sendInput(body.text);
  if (!result.ok) {
    res.status(409).json({ error: result.reason });
    return;
  }
  res.json({ ok: true, state: session.state });
});

// POST /api/orchestrations/:runId/cancel
router.post('/:runId/cancel', async (req, res) => {
  const runId = req.params['runId'];
  const session = runId ? runSessions.get(runId) : undefined;
  if (!session) {
    res.status(404).json({ error: 'run not found' });
    return;
  }
  await session.cancel();
  res.json({ ok: true, state: session.state });
});

export { router as orchestrationsRouter };
