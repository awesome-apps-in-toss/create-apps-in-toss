import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  AppInfo,
  AppDocs,
  AppFrameworkConfig,
  AppConsoleConfig,
} from '../../src/types/index.js';
import { DEFAULT_CONSOLE_CONFIG } from '../../src/types/index.js';

const router = Router();
const APPS_DIR = path.resolve(process.cwd(), '../');

// ── 앱 프레임워크 설정 파싱 (granite.config.ts 지원) ────────────
async function readGranite(appDir: string): Promise<AppFrameworkConfig | null> {
  const configPath = path.join(appDir, 'granite.config.ts');
  try {
    const text = await fs.readFile(configPath, 'utf-8');
    const brandBlock = text.match(/brand:\s*\{([^}]+)\}/s)?.[1] ?? '';
    return {
      appName: text.match(/appName:\s*['"]([^'"]+)['"]/)?.[1] ?? null,
      displayName: brandBlock.match(/displayName:\s*['"]([^'"]+)['"]/)?.[1] ?? null,
      primaryColor: brandBlock.match(/primaryColor:\s*['"]([^'"]+)['"]/)?.[1] ?? null,
      icon: brandBlock.match(/icon:\s*['"]([^'"]+)['"]/)?.[1] ?? null,
    };
  } catch {
    return null;
  }
}

// ── .meta-dashboard.json 읽기 ─────────────────────────────────
async function readConsoleConfig(appDir: string): Promise<AppConsoleConfig> {
  const configPath = path.join(appDir, '.meta-dashboard.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    return { ...DEFAULT_CONSOLE_CONFIG, ...(JSON.parse(raw) as Partial<AppConsoleConfig>) };
  } catch {
    return { ...DEFAULT_CONSOLE_CONFIG };
  }
}

// ── 문서 경로 확인 (.meta/app.json의 prdPath / utPath) ──────────
async function readDocs(appDir: string, console_: AppConsoleConfig): Promise<AppDocs> {
  async function checkDoc(relPath: string | null) {
    if (!relPath) return { exists: false };
    const absPath = path.resolve(appDir, relPath);
    const exists = await fileExists(absPath);
    if (!exists) return { exists: false, path: absPath };
    const stat = await fs.stat(absPath);
    return {
      exists: true,
      path: absPath,
      date: stat.mtime.toISOString().slice(0, 10),
    };
  }

  const [prd, ut] = await Promise.all([checkDoc(console_.prdPath), checkDoc(console_.utPath)]);
  return { prd, ut };
}

// ── 완성도 계산 (레이어 가중치) ───────────────────────────────
// Layer 1: 40% (각 10% × 4항목: displayName, primaryColor, icon, .ait)
// Layer 2: 30% (로고 10%, 노출정보 10%, 에셋 10%)
// Layer 3: 30% (PRD 15%, UT 15%)
async function calcCompletion(
  appDir: string,
  granite: GraniteBrand | null,
  console_: AppConsoleConfig,
  docs: AppDocs
): Promise<{ total: number; layer1: number; layer2: number; layer3: number }> {
  // Layer 1
  const hasDisplayName = !!granite?.displayName;
  const hasPrimaryColor = !!granite?.primaryColor;
  const hasIcon = !!granite?.icon;
  const hasAit = await fileExists(path.join(appDir, '.ait'));
  const layer1 =
    (hasDisplayName ? 10 : 0) + (hasPrimaryColor ? 10 : 0) + (hasIcon ? 10 : 0) + (hasAit ? 10 : 0);

  // Layer 2
  const hasLogo = !!console_.logoPath;
  const hasNotion = !!(console_.subtitle && console_.description && console_.keywords.length > 0);
  const hasThumbnail = !!(console_.thumbnailPath || console_.screenshotPaths.length > 0);
  const layer2 = (hasLogo ? 10 : 0) + (hasNotion ? 10 : 0) + (hasThumbnail ? 10 : 0);

  // Layer 3
  const layer3 = (docs.prd.exists ? 15 : 0) + (docs.ut.exists ? 15 : 0);

  return { total: layer1 + layer2 + layer3, layer1, layer2, layer3 };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ── 앱 목록 로드 ───────────────────────────────────────────────
async function loadAllApps(): Promise<AppInfo[]> {
  const entries = await fs.readdir(APPS_DIR, { withFileTypes: true });
  const appFolders = entries
    .filter((e) => e.isDirectory() && e.name !== 'dashboard')
    .map((e) => e.name);

  const results = await Promise.all(
    appFolders.map(async (folderName) => {
      const appDir = path.join(APPS_DIR, folderName);
      const pkgPath = path.join(appDir, 'package.json');
      try {
        const raw = await fs.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw) as {
          name?: string;
          version?: string;
          description?: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };

        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        const [granite, consoleConfig] = await Promise.all([
          readGranite(appDir),
          readConsoleConfig(appDir),
        ]);
        const docs = await readDocs(appDir, consoleConfig);
        const comp = await calcCompletion(appDir, granite, consoleConfig, docs);

        const info: AppInfo = {
          folderName,
          packageName: pkg.name ?? folderName,
          version: pkg.version ?? '0.0.0',
          description: pkg.description ?? '',
          dependencies: deps,
          granite,
          console: consoleConfig,
          docs,
          completion: comp.total,
          completionDetail: { layer1: comp.layer1, layer2: comp.layer2, layer3: comp.layer3 },
        };
        return info;
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is AppInfo => r !== null);
}

router.get('/', async (_req, res) => {
  try {
    const apps = await loadAllApps();
    res.json(apps);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const apps = await loadAllApps();
    const app = apps.find((a) => a.folderName === req.params['id']);
    if (!app) {
      res.status(404).json({ error: 'App not found' });
      return;
    }
    res.json(app);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export { router as appsRouter, loadAllApps };
