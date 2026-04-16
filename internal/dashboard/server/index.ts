import express from 'express';
import cors from 'cors';
import path from 'path';
import { appsRouter } from './routes/apps.js';
import { metaRouter } from './routes/meta.js';
import { runSkillRouter } from './routes/run-skill.js';
import { createAppRouter } from './routes/create-app.js';
import { createWatcher } from './watcher.js';
import { sseClients } from './sse.js';

const app = express();
const PORT = 3001;
const APPS_DIR = path.resolve(process.cwd(), '../');

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
app.use('/api/run-skill', runSkillRouter);

createWatcher();

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
