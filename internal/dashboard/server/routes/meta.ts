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
  'prdReviewedAt', 'prdSource',
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

// POST /api/apps/:id/upload-prd
// Body: { filename: string, content: string }
// → docs/prd/{filename} 저장 + .meta-dashboard.json prdPath 갱신
router.post('/:id/upload-prd', async (req, res) => {
  const appId = req.params['id'];
  if (!validateAppId(appId)) {
    res.status(400).json({ error: 'Invalid app id' });
    return;
  }
  const appDir = path.join(APPS_DIR, appId);
  const { filename, content } = req.body as { filename?: string; content?: string };

  if (!filename || !content) {
    res.status(400).json({ error: 'filename and content required' });
    return;
  }

  // 확장자 검증
  if (!filename.endsWith('.md') && !filename.endsWith('.txt')) {
    res.status(400).json({ error: 'Only .md or .txt files allowed' });
    return;
  }

  // 파일명에서 경로 탈출 방지
  const safeName = path.basename(filename);
  const prdDir = path.join(appDir, 'docs', 'prd');
  const prdPath = path.join(prdDir, safeName);

  // docs/prd/ 디렉토리 생성
  await fs.mkdir(prdDir, { recursive: true });
  await fs.writeFile(prdPath, content, 'utf-8');

  // .meta-dashboard.json에 prdPath 기록
  const configPath = path.join(appDir, META_FILE);
  const relPath = `docs/prd/${safeName}`;

  await withWriteLock(appId, async () => {
    let existing: Partial<AppConsoleConfig> = {};
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      existing = JSON.parse(raw) as Partial<AppConsoleConfig>;
    } catch {
      // 파일 없으면 새로 생성
    }

    const updated: AppConsoleConfig = {
      ...DEFAULT_CONSOLE_CONFIG,
      ...existing,
      prdPath: relPath,
      // 외부에서 가져온 기획서는 정책 검토가 필요한 상태로 표기.
      prdSource: 'uploaded',
      prdReviewedAt: null,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(configPath, JSON.stringify(updated, null, 2), 'utf-8');
  });

  res.json({ path: relPath });
});

export { router as metaRouter };
