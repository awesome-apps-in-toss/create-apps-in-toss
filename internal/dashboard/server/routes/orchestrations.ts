import { Router } from 'express';
import path from 'path';
import { RunSession, runSessions } from '../lib/orchestration/run-session.js';
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

function sessionSummary(session: RunSession) {
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

// POST /api/orchestrations
// Body: {
//   skill: string,            // pipeline skill id (frontmatter에 step 필요)
//   appName?: string,         // scaffold/launch 외에는 필수
//   input?: {
//     idea?: string,          // legacy (ait-plan)
//     prompt?: string,        // 일반 프롬프트 오버라이드
//   },
//   idempotencyKey?: string,  // 선택 — 같은 키 성공 기록이 있으면 후속 stage에서 스킵
// }
router.post('/', async (req, res) => {
  const body = req.body as {
    skill?: unknown;
    appName?: unknown;
    input?: { idea?: unknown; prompt?: unknown };
    idempotencyKey?: unknown;
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

  const session = new RunSession({
    skill: skillId,
    cwd,
    initialPrompt,
    ...(appName !== undefined && { appName }),
    ...(idempotencyKey !== undefined && { idempotencyKey }),
  });
  runSessions.set(session.runId, session);

  res.status(201).json(sessionSummary(session));
});

// GET /api/orchestrations
// Query: ?app=<id>&skill=<id>&state=<state>
router.get('/', (req, res) => {
  const appFilter = typeof req.query['app'] === 'string' ? req.query['app'] : null;
  const skillFilter = typeof req.query['skill'] === 'string' ? req.query['skill'] : null;
  const stateFilter = typeof req.query['state'] === 'string' ? req.query['state'] : null;

  const runs = Array.from(runSessions.values())
    .filter((s) => (appFilter ? s.appName === appFilter : true))
    .filter((s) => (skillFilter ? s.skill === skillFilter : true))
    .filter((s) => (stateFilter ? s.state === stateFilter : true))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(sessionSummary);

  res.json({ runs });
});

// GET /api/orchestrations/:runId
router.get('/:runId', (req, res) => {
  const runId = req.params['runId'];
  const session = runId ? runSessions.get(runId) : undefined;
  if (!session) {
    res.status(404).json({ error: 'run not found' });
    return;
  }
  res.json({
    ...sessionSummary(session),
    initialPrompt: session.initialPrompt,
    idempotencyKey: session.idempotencyKey ?? null,
    history: session.getHistory(),
  });
});

// GET /api/orchestrations/:runId/stream → SSE
router.get('/:runId/stream', (req, res) => {
  const runId = req.params['runId'];
  const session = runId ? runSessions.get(runId) : undefined;
  if (!session) {
    res.status(404).json({ error: 'run not found' });
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
