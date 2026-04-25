import express from 'express';
import cors from 'cors';
import path from 'path';
import { appsRouter } from './routes/apps.js';
import { metaRouter } from './routes/meta.js';
import { createAppRouter } from './routes/create-app.js';
import { skillsRouter } from './routes/skills.js';
import { orchestrationsRouter } from './routes/orchestrations.js';
import { diagnosticsRouter } from './routes/diagnostics.js';
import { devServersRouter } from './routes/dev-servers.js';
import { createWatcher } from './watcher.js';
import { sseClients } from './sse.js';
import { getDefaultRunStore } from './lib/orchestration/run-store.js';
import { cleanupAllDevServers } from './lib/dev-servers.js';

const app = express();
const PORT = 3001;
const HOST = process.env['BARRELEYE_HOST'] || '127.0.0.1';
const APPS_DIR = path.resolve(process.cwd(), '../../apps');

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// SSE
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('data: connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── 앱 ID 검증 (경로 탈출 방지) ──
const APP_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
function validateAppId(id: string | undefined): id is string {
  return !!id && APP_ID_RE.test(id) && !id.includes('..');
}

// 앱 에셋 서빙: GET /api/apps/:id/asset?path=.meta/assets/logo.png
// path는 앱 폴더 기준 상대경로
app.get('/api/apps/:id/asset', (req, res) => {
  const appId = req.params['id'];
  const relPath = req.query['path'] as string;

  if (!validateAppId(appId) || !relPath) {
    res.status(400).json({ error: 'Valid id and path required' });
    return;
  }

  // 경로 탈출 방지: 앱 폴더 밖으로 나가지 못하게
  const appDir = path.resolve(APPS_DIR, appId);
  const resolved = path.resolve(appDir, relPath);
  if (!resolved.startsWith(appDir + path.sep)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  res.sendFile(resolved, (err) => {
    if (err) res.status(404).json({ error: 'File not found' });
  });
});

app.use('/api/apps/create', createAppRouter);
app.use('/api/apps', appsRouter);
app.use('/api/apps', metaRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/orchestrations', orchestrationsRouter);
app.use('/api/diagnostics', diagnosticsRouter);
app.use('/api/apps', devServersRouter);

createWatcher();

// dashboard 가 spawn 한 dev 서버 자식 프로세스는 dashboard 종료 시 함께 정리한다.
// 그렇지 않으면 cmd+C 후에도 vite 가 떠 있어 다음 실행에서 포트 충돌이 난다.
// cleanupAllDevServers 는 자식이 SIGTERM 에 응답해 정리될 시간(최대 5초) 을 기다린다.
let shuttingDown = false;
function shutdownAndExit(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received — cleaning up dev servers`);
  void cleanupAllDevServers().finally(() => {
    process.exit(0);
  });
}
process.on('SIGINT', shutdownAndExit);
process.on('SIGTERM', shutdownAndExit);

// 서버 재기동 시 child 프로세스가 사라져 orphan 상태가 된 run 기록을 FAILED로 정리.
// listen 전에 await 해서 첫 요청이 받아들여지는 시점에는 정리 완료 상태 보장.
async function bootstrap() {
  try {
    const store = await getDefaultRunStore();
    const cleaned = store.markOrphansFailed();
    if (cleaned > 0) {
      console.log(`[run-store] marked ${cleaned} orphan runs as FAILED after restart`);
    }
  } catch (err) {
    console.warn('[run-store] startup cleanup failed', err);
  }

  app.listen(PORT, HOST, () => {
    if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
      console.warn(
        '[server] ⚠ 외부 바인딩됨 — 약관상 개인 사용 경계를 넘을 수 있음. 신뢰된 네트워크에서만 사용.'
      );
    }
    console.log(`[server] http://${HOST}:${PORT}`);
  });
}

void bootstrap();
