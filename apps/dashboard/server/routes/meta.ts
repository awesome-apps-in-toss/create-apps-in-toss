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

// POST /api/apps/:id/upload-prd
// Body: { filename: string, content: string }
// → docs/prd/{filename} 저장 + .meta-dashboard.json prdPath 갱신
router.post('/:id/upload-prd', async (req, res) => {
  const appId = req.params['id'] ?? '';
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
  let existing: Partial<AppConsoleConfig> = {};
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    existing = JSON.parse(raw) as Partial<AppConsoleConfig>;
  } catch {
    // 파일 없으면 새로 생성
  }

  const relPath = `docs/prd/${safeName}`;
  const updated: AppConsoleConfig = {
    ...DEFAULT_CONSOLE_CONFIG,
    ...existing,
    prdPath: relPath,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2), 'utf-8');

  res.json({ path: relPath });
});

export { router as metaRouter };
