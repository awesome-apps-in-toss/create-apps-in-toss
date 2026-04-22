import { Router } from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import type { AppConsoleConfig } from '../../src/types/index.js';
import { DEFAULT_CONSOLE_CONFIG } from '../../src/types/index.js';
import { broadcast } from '../sse.js';

const router: Router = Router();
const REPO_ROOT = path.resolve(process.cwd(), '../../');
const APPS_ROOT = path.join(REPO_ROOT, 'apps');
const CREATE_APP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'create-app.js');

// 앱 폴더명 검증: 영문 소문자/숫자로 시작, 하이픈/점/언더스코어 허용, 경로 탈출 차단
const APP_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function validateAppName(name: unknown): name is string {
  return typeof name === 'string' && APP_ID_RE.test(name) && !name.includes('..');
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function runCreateScript(appName: string): Promise<{ code: number; logs: string[] }> {
  return new Promise((resolve) => {
    const logs: string[] = [];
    const proc = spawn(process.execPath, [CREATE_APP_SCRIPT, appName], {
      cwd: REPO_ROOT,
      env: { ...process.env },
      shell: false,
    });

    const pushLines = (buf: Buffer, prefix = '') => {
      buf
        .toString()
        .split('\n')
        .forEach((line) => {
          const trimmed = line.trimEnd();
          if (trimmed) logs.push(prefix + trimmed);
        });
    };

    proc.stdout.on('data', (chunk: Buffer) => pushLines(chunk));
    proc.stderr.on('data', (chunk: Buffer) => pushLines(chunk, '[stderr] '));
    proc.on('close', (code) => resolve({ code: code ?? 0, logs }));
    proc.on('error', (err) => {
      logs.push(`[spawn error] ${err.message}`);
      resolve({ code: -1, logs });
    });
  });
}

// granite.config.ts 의 displayName 교체 (사용자 입력이 있을 때만)
async function applyDisplayName(appName: string, displayName: string): Promise<void> {
  const configPath = path.join(APPS_ROOT, appName, 'granite.config.ts');
  const text = await fs.readFile(configPath, 'utf-8');
  // create-app.js 가 생성하는 초기값은 displayName: '<appName>'
  const replaced = text.replace(
    /displayName:\s*'[^']*'/,
    `displayName: '${displayName.replace(/'/g, "\\'")}'`,
  );
  if (replaced !== text) {
    await fs.writeFile(configPath, replaced, 'utf-8');
  }
}

async function writeMeta(
  appName: string,
  displayName: string | undefined,
  description: string | undefined,
): Promise<void> {
  if (!displayName && !description) return;
  const metaPath = path.join(APPS_ROOT, appName, '.meta-dashboard.json');
  const meta: AppConsoleConfig = {
    ...DEFAULT_CONSOLE_CONFIG,
    ...(displayName ? { nameKo: displayName } : {}),
    ...(description ? { description } : {}),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

// POST /api/apps/create
// Body: { appName: string, displayName?: string, description?: string, mode?: 'full' | 'planning-first' }
router.post('/', async (req, res) => {
  const body = req.body as {
    appName?: unknown;
    displayName?: unknown;
    description?: unknown;
    mode?: unknown;
  };
  const appName = body.appName;
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim()
      : undefined;
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : undefined;
  const mode = body.mode === 'planning-first' ? 'planning-first' : 'full';

  if (!validateAppName(appName)) {
    res.status(400).json({
      error: '영문 소문자/숫자로 시작하는 64자 이하 이름만 허용됩니다 (하이픈, 점, 언더스코어 가능).',
    });
    return;
  }

  const appDir = path.join(APPS_ROOT, appName);
  if (await dirExists(appDir)) {
    res.status(409).json({ error: `apps/${appName} 폴더가 이미 존재합니다.` });
    return;
  }

  // full:          pnpm new-app 실행 → 전체 스캐폴딩 완료
  // planning-first: 폴더 + 최소 package.json 만 생성 → /ait-scaffold 가 나중에 채움
  if (mode === 'full') {
    const { code, logs } = await runCreateScript(appName);
    if (code !== 0) {
      res.status(500).json({
        error: `스캐폴딩 실패 (exit code: ${code})`,
        logs,
      });
      return;
    }
    try {
      if (displayName) await applyDisplayName(appName, displayName);
      await writeMeta(appName, displayName, description);
    } catch (e) {
      res.status(500).json({
        error: `앱 메타 기록 실패: ${String(e)}`,
        logs,
      });
      return;
    }
    broadcast('refresh', 'created');
    res.status(201).json({ appName, mode, logs });
    return;
  }

  // planning-first 모드: 최소 스텁만 만들어두고 스캐폴딩은 /ait-scaffold 에게 위임
  try {
    await fs.mkdir(appDir, { recursive: true });
    const stubPkg = {
      name: `@barreleye/${appName}`,
      version: '0.0.0',
      private: true,
      description: description ?? '',
      // granite.config.ts / src 등 본체는 아직 없음을 표시
      'barreleye:stub': true,
    };
    await fs.writeFile(
      path.join(appDir, 'package.json'),
      JSON.stringify(stubPkg, null, 2),
      'utf-8',
    );
    await writeMeta(appName, displayName, description);
  } catch (e) {
    res.status(500).json({ error: `스텁 생성 실패: ${String(e)}` });
    return;
  }

  broadcast('refresh', 'created');
  res.status(201).json({ appName, mode, logs: [] });
});

export { router as createAppRouter };
