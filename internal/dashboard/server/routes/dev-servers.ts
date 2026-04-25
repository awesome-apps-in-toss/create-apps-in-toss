import { Router, type Router as ExpressRouter } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import {
  startDevServer,
  stopDevServer,
  getDevServerStatus,
} from '../lib/dev-servers.js';

const APPS_DIR = path.resolve(process.cwd(), '../../apps');
const APP_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

function isValidAppId(id: string | undefined): id is string {
  return !!id && APP_ID_RE.test(id) && !id.includes('..');
}

async function readPackageName(appDir: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(appDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as { name?: string };
    return typeof pkg.name === 'string' ? pkg.name : null;
  } catch {
    return null;
  }
}

export const devServersRouter: ExpressRouter = Router();

devServersRouter.get('/:id/dev-server/status', async (req, res) => {
  const id = req.params['id'];
  if (!isValidAppId(id)) {
    res.status(400).json({ error: 'invalid app id' });
    return;
  }
  const appDir = path.join(APPS_DIR, id);
  res.json(await getDevServerStatus(id, appDir));
});

devServersRouter.post('/:id/dev-server/start', async (req, res) => {
  const id = req.params['id'];
  if (!isValidAppId(id)) {
    res.status(400).json({ error: 'invalid app id' });
    return;
  }
  const appDir = path.join(APPS_DIR, id);
  const pkgName = await readPackageName(appDir);
  if (!pkgName) {
    res.status(400).json({ error: 'package.json 을 읽지 못했어요. 스캐폴딩이 끝났는지 확인해 주세요.' });
    return;
  }
  res.json(await startDevServer(id, appDir, pkgName));
});

devServersRouter.post('/:id/dev-server/stop', async (req, res) => {
  const id = req.params['id'];
  if (!isValidAppId(id)) {
    res.status(400).json({ error: 'invalid app id' });
    return;
  }
  res.json(await stopDevServer(id));
});
