import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import type { AppConsoleConfig } from '../../src/types/index.js';
import { DEFAULT_CONSOLE_CONFIG } from '../../src/types/index.js';

const router: Router = Router();
const APPS_DIR = path.resolve(process.cwd(), '../../apps');
const META_FILE = '.meta-dashboard.json';

// ── 앱 ID 검증 (경로 탈출 방지) ──
const APP_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
function validateAppId(id: string | undefined): id is string {
  return !!id && APP_ID_RE.test(id) && !id.includes('..');
}

// ── 동시 쓰기 방지 뮤텍스 ──
const writeLocks = new Map<string, Promise<unknown>>();
async function withWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (writeLocks.has(key)) {
    await writeLocks.get(key);
  }
  const promise = fn();
  writeLocks.set(key, promise);
  try {
    return await promise;
  } finally {
    writeLocks.delete(key);
  }
}

// ── req.body 허용 필드 ──
const ALLOWED_CONSOLE_FIELDS = new Set([
  'version', 'nameKo', 'nameEn', 'isGame', 'aitCategory',
  'subtitle', 'description', 'keywords',
  'logoPath', 'thumbnailPath', 'screenshotPaths',
  'prdPath', 'utPath',
]);

// GET /api/apps/:id/console
router.get('/:id/console', async (req, res) => {
  const appId = req.params['id'];
  if (!validateAppId(appId)) {
    res.status(400).json({ error: 'Invalid app id' });
    return;
  }
  const configPath = path.join(APPS_DIR, appId, META_FILE);
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    res.json(JSON.parse(raw));
  } catch {
    res.json({ ...DEFAULT_CONSOLE_CONFIG });
  }
});

// PUT /api/apps/:id/console
router.put('/:id/console', async (req, res) => {
  const appId = req.params['id'];
  if (!validateAppId(appId)) {
    res.status(400).json({ error: 'Invalid app id' });
    return;
  }

  // 허용된 필드만 필터링
  const body = req.body as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_CONSOLE_FIELDS.has(key)) {
      filtered[key] = value;
    }
  }

  const appDir = path.join(APPS_DIR, appId);
  const configPath = path.join(appDir, META_FILE);

  const updated = await withWriteLock(appId, async () => {
    let existing: Partial<AppConsoleConfig> = {};
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      existing = JSON.parse(raw) as Partial<AppConsoleConfig>;
    } catch {
      // 파일 없으면 기본값 사용
    }

    const merged: AppConsoleConfig = {
      ...DEFAULT_CONSOLE_CONFIG,
      ...existing,
      ...filtered,
      updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  });

  res.json(updated);
});

export { router as metaRouter };
