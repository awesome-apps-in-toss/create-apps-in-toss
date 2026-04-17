import { Router } from 'express';
import path from 'path';
import { RunSession, runSessions } from '../lib/orchestration/run-session.js';

const router: Router = Router();
const REPO_ROOT = path.resolve(process.cwd(), '../../');

// POST /api/orchestrations
// Body: { appName?: string, input: { idea: string } }
router.post('/', (req, res) => {
  const body = req.body as { appName?: unknown; input?: { idea?: unknown } };
  const idea = body?.input?.idea;
  if (typeof idea !== 'string' || !idea.trim()) {
    res.status(400).json({ error: 'input.idea (non-empty string) required' });
    return;
  }
  const appName = typeof body.appName === 'string' && body.appName.trim() ? body.appName.trim() : undefined;

  // TODO: idempotencyKey(appName + skill) 중복 실행 방지는 후속 PR에서 추가.
  const sessionInit = {
    skill: 'ait-plan' as const,
    cwd: REPO_ROOT,
    initialPrompt: idea,
    ...(appName !== undefined && { appName }),
  };
  const session = new RunSession(sessionInit);
  runSessions.set(session.runId, session);

  res.status(201).json({ runId: session.runId, skill: session.skill, state: session.state });
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

  session.addClient(res);
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
