import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import type { AppConsoleConfig } from '../../src/types/index.js';
import { DEFAULT_CONSOLE_CONFIG } from '../../src/types/index.js';

const router = Router();
const APPS_DIR = path.resolve(process.cwd(), '../');
const META_FILE = '.meta-dashboard.json';

// GET /api/apps/:id/console
router.get('/:id/console', async (req, res) => {
  const configPath = path.join(APPS_DIR, req.params['id'] ?? '', META_FILE);
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    res.json(JSON.parse(raw));
  } catch {
    res.json({ ...DEFAULT_CONSOLE_CONFIG });
  }
});

// PUT /api/apps/:id/console
router.put('/:id/console', async (req, res) => {
  const appDir = path.join(APPS_DIR, req.params['id'] ?? '');
  const configPath = path.join(appDir, META_FILE);

  let existing: Partial<AppConsoleConfig> = {};
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    existing = JSON.parse(raw) as Partial<AppConsoleConfig>;
  } catch {
    // 파일 없으면 기본값 사용
  }

  const updated: AppConsoleConfig = {
    ...DEFAULT_CONSOLE_CONFIG,
    ...existing,
    ...(req.body as Partial<AppConsoleConfig>),
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(configPath, JSON.stringify(updated, null, 2), 'utf-8');
  res.json(updated);
});

export { router as metaRouter };
