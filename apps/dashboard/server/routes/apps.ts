import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  AppInfo,
  AppDoc,
  AppDocs,
  GraniteBrand,
  AppConsoleConfig,
  PipelineStepStatus,
} from '../../src/types/index.js';
import { DEFAULT_CONSOLE_CONFIG } from '../../src/types/index.js';

const router = Router();
const APPS_DIR = path.resolve(process.cwd(), '../');

// ── 앱 프레임워크 설정 파싱 (granite.config.ts 지원) ────────────
async function readGranite(appDir: string): Promise<GraniteBrand | null> {
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

// ── 문서 경로 자동 감지 + 확인 ──────────────────────────────────
// prdPath / utPath 가 설정되지 않은 경우 관례적 경로에서 자동 탐색
const PRD_SCAN_PATHS = [
  'docs/PRD.md',
  'docs/prd.md',
  'docs/prd/PRD.md',
];
const PRD_SCAN_GLOBS = ['docs/prd/*.md', 'docs/*PRD*.md', 'docs/*prd*.md'];

const UT_SCAN_PATHS = [
  'docs/user-test/report.md',
  'docs/ut-report.md',
];
const UT_SCAN_GLOBS = ['docs/ait-ut-*.md', 'docs/ut-*.md', 'docs/user-test/*.md'];

async function findFirstFile(appDir: string, candidates: string[]): Promise<string | null> {
  for (const rel of candidates) {
    if (await fileExists(path.join(appDir, rel))) return rel;
  }
  return null;
}

async function findByGlob(appDir: string, patterns: string[]): Promise<string | null> {
  for (const pattern of patterns) {
    // 간단한 glob: docs/prd/*.md → docs/prd/ 디렉토리에서 .md 파일 탐색
    const parts = pattern.split('/');
    const filePattern = parts.pop()!;
    const dir = parts.join('/');
    const absDir = path.join(appDir, dir);
    try {
      const entries = await fs.readdir(absDir);
      const regex = new RegExp(
        '^' + filePattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
        'i'
      );
      const match = entries.find((e) => regex.test(e));
      if (match) return `${dir}/${match}`;
    } catch {
      // 디렉토리 없음 → 다음 패턴
    }
  }
  return null;
}

async function autoDetectDoc(
  appDir: string,
  configuredPath: string | null,
  scanPaths: string[],
  scanGlobs: string[]
): Promise<AppDoc> {
  // 1) 설정된 경로가 있으면 먼저 확인
  if (configuredPath) {
    const absPath = path.resolve(appDir, configuredPath);
    const exists = await fileExists(absPath);
    if (exists) {
      const stat = await fs.stat(absPath);
      return { exists: true, path: configuredPath, date: stat.mtime.toISOString().slice(0, 10) };
    }
    return { exists: false, path: configuredPath };
  }

  // 2) 관례적 경로에서 자동 탐색
  const found =
    (await findFirstFile(appDir, scanPaths)) ?? (await findByGlob(appDir, scanGlobs));

  if (found) {
    const stat = await fs.stat(path.join(appDir, found));
    return {
      exists: true,
      path: found,
      date: stat.mtime.toISOString().slice(0, 10),
      autoDetected: true,
    };
  }

  return { exists: false };
}

async function readDocs(appDir: string, console_: AppConsoleConfig): Promise<AppDocs> {
  const [prd, ut] = await Promise.all([
    autoDetectDoc(appDir, console_.prdPath, PRD_SCAN_PATHS, PRD_SCAN_GLOBS),
    autoDetectDoc(appDir, console_.utPath, UT_SCAN_PATHS, UT_SCAN_GLOBS),
  ]);
  return { prd, ut };
}

// ── 파이프라인 진행 상태 자동 감지 ─────────────────────────────
// 저장된 pipelineProgress에 없더라도 산출물이 존재하면 완료로 간주
async function autoDetectPipelineProgress(
  appDir: string,
  granite: GraniteBrand | null,
  console_: AppConsoleConfig,
  docs: AppDocs,
  deps: Record<string, string>,
): Promise<Record<number, PipelineStepStatus>> {
  const stored = console_.pipelineProgress ?? {};
  const merged: Record<number, PipelineStepStatus> = { ...stored };

  // Step 1: PRD 존재 → 기획 완료
  if (!merged[1] && docs.prd.exists) {
    merged[1] = { completedAt: docs.prd.date ?? '', artifacts: docs.prd.path ? { prd: docs.prd.path } : undefined };
  }

  // Step 2: 로고/썸네일 존재 → 에셋 완료 (autoDetectAssets 호출 후 enriched 상태)
  if (!merged[2] && console_.logoPath) {
    const logoAbs = path.join(appDir, console_.logoPath);
    const stat = await fs.stat(logoAbs).catch(() => null);
    const artifacts: Record<string, string> = { logo: console_.logoPath };
    if (console_.thumbnailPath) artifacts['thumbnail'] = console_.thumbnailPath;
    merged[2] = { completedAt: stat ? stat.mtime.toISOString().slice(0, 10) : '', artifacts };
  }

  // Step 3: granite.config.ts 존재 → 스캐폴딩 완료
  if (!merged[3] && granite) {
    merged[3] = { completedAt: '', artifacts: {} };
  }

  // Step 4: @toss 패키지 의존성 → TDS 설정 완료
  if (!merged[4]) {
    const hasTds = Object.keys(deps).some((d) => d.startsWith('@toss/'));
    if (hasTds) {
      merged[4] = { completedAt: '' };
    }
  }

  // Step 7: .ait 파일 존재 → 빌드 완료
  if (!merged[7]) {
    if (await fileExists(path.join(appDir, '.ait'))) {
      const stat = await fs.stat(path.join(appDir, '.ait')).catch(() => null);
      merged[7] = { completedAt: stat ? stat.mtime.toISOString().slice(0, 10) : '' };
    }
  }

  return merged;
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

// ── 에셋 자동 감지 (assets/ 디렉토리 스캔) ─────────────────────
// ait-assets 스킬이 생성한 파일을 자동으로 찾아 config에 반영
const ASSET_LOGO_CANDIDATES = ['assets/logo.png', 'assets/logo.svg'];
const ASSET_THUMBNAIL_CANDIDATES = ['assets/thumbnail-wide.png', 'assets/thumbnail-wide.svg'];
const ASSET_SCREENSHOT_CANDIDATES = ['assets/thumbnail-square.png', 'assets/thumbnail-square.svg'];

async function autoDetectAssets(appDir: string, console_: AppConsoleConfig): Promise<void> {
  // logoPath 자동 감지
  if (!console_.logoPath) {
    for (const candidate of ASSET_LOGO_CANDIDATES) {
      if (await fileExists(path.join(appDir, candidate))) {
        console_.logoPath = candidate;
        break;
      }
    }
  }
  // thumbnailPath 자동 감지
  if (!console_.thumbnailPath) {
    for (const candidate of ASSET_THUMBNAIL_CANDIDATES) {
      if (await fileExists(path.join(appDir, candidate))) {
        console_.thumbnailPath = candidate;
        break;
      }
    }
  }
  // screenshotPaths 자동 감지
  if (console_.screenshotPaths.length === 0) {
    for (const candidate of ASSET_SCREENSHOT_CANDIDATES) {
      if (await fileExists(path.join(appDir, candidate))) {
        console_.screenshotPaths = [candidate];
        break;
      }
    }
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
        // 에셋 자동 감지 → config 보강 (logoPath, thumbnailPath 등)
        await autoDetectAssets(appDir, consoleConfig);
        const pipelineProgress = await autoDetectPipelineProgress(appDir, granite, consoleConfig, docs, deps);
        // consoleConfig에 자동 감지 결과 반영
        consoleConfig.pipelineProgress = pipelineProgress;
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
