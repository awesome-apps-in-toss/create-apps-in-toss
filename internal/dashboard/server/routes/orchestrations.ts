import { Router } from 'express';
import path from 'path';
import {
  RunSession,
  runSessions,
  TERMINAL_STATES,
  type HistoricRunEvent,
  type RunState,
} from '../lib/orchestration/run-session.js';
import { getDefaultRunStore, type PersistedRunRow } from '../lib/orchestration/run-store.js';
import { readSkillMeta } from '../lib/skills-meta.js';
import { broadcast } from '../sse.js';
import { readConsoleConfigByAppId, updateConsoleConfig } from './meta.js';
import { autoDetectDoc, PRD_SCAN_GLOBS, PRD_SCAN_PATHS } from './apps.js';

const router: Router = Router();
const REPO_ROOT = path.resolve(process.cwd(), '../../');
const APPS_DIR = path.join(REPO_ROOT, 'apps');

async function persistGeneratedPrdPath(session: RunSession): Promise<void> {
  if (session.skill !== 'ait-plan' || !session.appName || session.state !== 'COMPLETED') return;

  const appDir = path.join(APPS_DIR, session.appName);
  const existing = await readConsoleConfigByAppId(session.appName);
  const detected = await autoDetectDoc(appDir, existing.prdPath, PRD_SCAN_PATHS, PRD_SCAN_GLOBS);
  if (!detected.exists || !detected.path) return;

  await updateConsoleConfig(session.appName, {
    prdPath: detected.path,
    prdSource: 'generated',
    prdReviewedAt: existing.prdReviewedAt || new Date().toISOString(),
  });
}

// (skill, appName) 단위로 POST /api/orchestrations 호출을 순차화.
// "이미 실행 중" 체크와 새 세션 spawn 사이에 await 가 있어서
// 동시 호출 시 같은 스킬이 두 번 spawn 되는 race 를 차단한다.
const startLocks = new Map<string, Promise<unknown>>();
async function withStartLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = startLocks.get(key);
  if (prev) {
    try { await prev; } catch { /* 이전 호출 실패해도 계속 진행 */ }
  }
  const promise = (async () => fn())();
  startLocks.set(key, promise);
  try {
    return await promise;
  } finally {
    if (startLocks.get(key) === promise) startLocks.delete(key);
  }
}

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
  // 한 세션 당 한 번만 broadcast. state/done 이벤트가 중복으로 들어와도, 리플레이로 과거
  // 이벤트가 다시 흘러도, 글로벌 refresh 를 두 번 쏘지 않게 보장한다.
  let terminalBroadcast = false;
  session.addListener(
    (event: HistoricRunEvent) => {
      try {
        // text_delta 는 매 턴마다 수십~수백 건 나오는 고빈도 이벤트.
        // 완성 텍스트는 text_stop 이벤트 data.text 에 실리므로 리플레이 복원에도 충분하다.
        // SQLite 용량과 insert I/O 를 아끼기 위해 영속화에서 스킵한다.
        if (event.kind === 'text_delta') return;
        store.appendEvent(session.runId, event);
        if (event.kind === 'state' || event.kind === 'done') {
          store.updateState(
            session.runId,
            session.state,
            session.exitCode ?? null,
            session.endedAt ?? null
          );
          if (TERMINAL_STATES.has(session.state) && !terminalBroadcast) {
            terminalBroadcast = true;
            void (async () => {
              try {
                await persistGeneratedPrdPath(session);
              } catch (err) {
                console.warn('[orchestrations] persistGeneratedPrdPath failed', err);
              } finally {
                // 파일 와처(.meta-dashboard.json/.ait 만 감시)가 잡지 못하는 산출물
                // — granite.config.ts, package.json, docs/PRD.md 등 — 도 즉시 메타/콘피그
                // UI 에 반영되도록 글로벌 refresh 를 한 번 쏜다. useApps · useRuns 가 이를 듣고
                // /api/apps · /api/orchestrations 를 다시 조회한다.
                broadcast('refresh', `run-terminated:${session.skill}:${session.appName ?? ''}`);
              }
            })();
          }
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
//   idempotencyKey?: string,  // 선택 — 같은 키의 성공/실행중 기록이 있으면 재사용
//   forceRerun?: boolean,     // true 면 캐시된 COMPLETED 무시하고 새로 spawn
// }
//
// 응답 body에 reused: boolean 와 reason: 'running'|'cached'|null 포함.
router.post('/', async (req, res) => {
  const body = req.body as {
    skill?: unknown;
    appName?: unknown;
    input?: { idea?: unknown; prompt?: unknown };
    idempotencyKey?: unknown;
    forceRerun?: unknown;
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
  const rawInitial = (
    typeof promptOverride === 'string' ? promptOverride : typeof idea === 'string' ? idea : ''
  ).trim();

  // ait-scaffold / ait-launch 는 cwd 가 REPO_ROOT 이므로 어떤 앱인지 argv 로 전달해야 한다.
  // 다른 스킬은 cwd 가 이미 `apps/<name>` 이라 별도 인자 불필요.
  // 사용자가 명시 prompt 에 appName 을 이미 넣었으면 그대로 두고, 없을 때만 앞에 붙인다.
  const needsAppArg = skillId === 'ait-scaffold' || skillId === 'ait-launch';
  const initialPrompt =
    needsAppArg && appName && !rawInitial.split(/\s+/).includes(appName)
      ? [appName, rawInitial].filter(Boolean).join(' ')
      : rawInitial;

  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : meta.idempotencyKey;

  const forceRerun = body.forceRerun === true;
  const lockKey = `${skillId}::${appName ?? ''}`;

  // 1~3 단계를 (skill, appName) 단위 락으로 감싸 중복 spawn 방지.
  const outcome = await withStartLock(lockKey, async () => {
    // 1) 동일 (skill, appName) 로 이미 실행 중인 세션이 있으면 그걸 반환.
    for (const live of runSessions.values()) {
      const sameApp = (live.appName ?? null) === (appName ?? null);
      const sameSkill = live.skill === skillId;
      if (sameApp && sameSkill && !TERMINAL_STATES.has(live.state)) {
        return { kind: 'running' as const, session: live };
      }
    }

    // 2) forceRerun 이 아니면, 같은 (skill, appName, idempotencyKey) 의 최근 COMPLETED 기록 재사용.
    if (!forceRerun) {
      const store = await getDefaultRunStore();
      const existing = store.findLatestSuccess({
        skill: skillId,
        appName: appName ?? null,
        idempotencyKey: idempotencyKey ?? null,
      });
      if (existing) return { kind: 'cached' as const, row: existing };
    }

    // 3) 새 세션 spawn.
    const session = new RunSession({
      skill: skillId,
      cwd,
      initialPrompt,
      mode: meta.mode,
      ...(appName !== undefined && { appName }),
      ...(idempotencyKey !== undefined && { idempotencyKey }),
    });
    runSessions.set(session.runId, session);
    await attachStore(session);
    return { kind: 'spawned' as const, session };
  });

  if (outcome.kind === 'running') {
    res.status(200).json({ ...liveSummary(outcome.session), reused: true, reason: 'running' });
    return;
  }
  if (outcome.kind === 'cached') {
    res.status(200).json({ ...persistedSummary(outcome.row), reused: true, reason: 'cached' });
    return;
  }
  res.status(201).json({ ...liveSummary(outcome.session), reused: false, reason: null });
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
// Query:
//   replay=false  → live 세션의 과거 이벤트 replay 건너뛰기 (기본 true)
//   fromSeq=N     → seq >= N 인 이벤트만 송출 (재접속 시 이미 받은 이벤트 스킵용)
router.get('/:runId/stream', async (req, res) => {
  const runId = req.params['runId'];
  if (!runId) {
    res.status(400).json({ error: 'runId required' });
    return;
  }
  const live = runSessions.get(runId);
  const fromSeqRaw = typeof req.query['fromSeq'] === 'string' ? parseInt(req.query['fromSeq'], 10) : NaN;
  const fromSeq = Number.isFinite(fromSeqRaw) && fromSeqRaw >= 0 ? fromSeqRaw : 0;
  const replay = req.query['replay'] !== 'false';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (live) {
    live.addClient(res, { replay, fromSeq });
    return;
  }

  // 라이브 세션이 없으면 SQLite 이력에서 replay 하고 스트림을 닫는다.
  const store = await getDefaultRunStore();
  const row = store.getRun(runId);
  if (!row) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'run not found' })}\n\n`);
    res.end();
    return;
  }
  // replay=false 쿼리를 존중. 복원 경로에서도 과거 이벤트를 다시 쏘지 않고 최종 state/done 만 보낸다.
  if (replay) {
    const events = store.listEvents(runId);
    for (const event of events) {
      if (event.seq < fromSeq) continue;
      try {
        res.write(`event: ${event.kind}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        break;
      }
    }
  }
  // 영속 이력 뒤에는 현재 저장된 상태를 한 번 더 알려준다 (클라이언트 state 정합).
  try {
    res.write(
      `event: state\ndata: ${JSON.stringify({
        seq: -1,
        kind: 'state',
        data: { state: row.state },
        at: row.endedAt ?? row.startedAt,
      })}\n\n`
    );
    res.write(
      `event: done\ndata: ${JSON.stringify({
        seq: -1,
        kind: 'done',
        data: { exitCode: row.exitCode, finalState: row.state, restoredFromStore: true },
        at: row.endedAt ?? row.startedAt,
      })}\n\n`
    );
  } catch {
    // ignore
  }
  res.end();
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
  const body = req.body as { text?: unknown; toolUseId?: unknown };
  if (typeof body.text !== 'string') {
    res.status(400).json({ error: 'text (string) required' });
    return;
  }
  const toolUseId = typeof body.toolUseId === 'string' ? body.toolUseId : undefined;
  const result = session.sendInput(body.text, toolUseId ? { toolUseId } : {});
  if (!result.ok) {
    res.status(409).json({ error: result.reason });
    return;
  }
  res.json({ ok: true, state: session.state });
});

// POST /api/orchestrations/:runId/finish
// interactive 세션을 graceful 하게 종료 (stdin 닫기 → 현재 턴 마무리 후 CLI 자연 exit → COMPLETED).
// cancel 과 달리 SIGTERM 을 보내지 않는다. 사용자가 대시보드에서 "이 단계 완료" 를 눌렀을 때 사용.
router.post('/:runId/finish', (req, res) => {
  const runId = req.params['runId'];
  const session = runId ? runSessions.get(runId) : undefined;
  if (!session) {
    res.status(404).json({ error: 'run not found' });
    return;
  }
  const result = session.finishInteractive();
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
