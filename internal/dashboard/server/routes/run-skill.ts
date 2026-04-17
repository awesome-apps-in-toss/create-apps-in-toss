import { Router } from 'express';
import { spawn, execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { PIPELINE_SKILLS } from '../../src/types/index.js';

const router: Router = Router();
const REPO_ROOT = path.resolve(process.cwd(), '../../');
const APPS_DIR = path.join(REPO_ROOT, 'apps');

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

const ALLOWED_SKILLS = [
  // Pipeline (7-step sequential)
  'ait-plan',
  'ait-assets',
  'ait-scaffold',
  'ait-tds-setup',
  'ait-implement',
  'ait-review',
  'ait-build',
  // Utility (standalone)
  'ait-meta',
  'ait-ut',
  'ait-launch',
] as const;
type Skill = (typeof ALLOWED_SKILLS)[number];

// ait-scaffold, ait-launch는 모노레포 루트에서 실행 (앱 생성/전체 관리)
// 나머지는 앱 폴더에서 실행
function getCwd(skill: Skill, appName: string): string {
  if (skill === 'ait-scaffold' || skill === 'ait-launch') return REPO_ROOT;
  return path.join(APPS_DIR, appName);
}

function getClaudePath(): string {
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude';
  }
}

router.get('/stream', (req, res) => {
  const skill = req.query['skill'] as string;
  const appName = req.query['app'] as string;

  if (!skill || !appName) {
    res.status(400).json({ error: 'skill and app params required' });
    return;
  }

  if (!validateAppId(appName)) {
    res.status(400).json({ error: 'Invalid app name' });
    return;
  }

  if (!(ALLOWED_SKILLS as readonly string[]).includes(skill)) {
    res.status(400).json({ error: `Unknown skill. Allowed: ${ALLOWED_SKILLS.join(', ')}` });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendLog = (line: string) => res.write(`event: log\ndata: ${line.replace(/\n/g, ' ')}\n\n`);
  const sendDone = () => {
    res.write('event: done\ndata: ok\n\n');
    res.end();
  };

  const typedSkill = skill as Skill;
  const cwd = getCwd(typedSkill, appName);
  const claudePath = getClaudePath();

  sendLog(`[dashboard] /${skill} 실행 중 (앱: ${appName})`);
  sendLog(`[dashboard] cwd: ${cwd}`);
  sendLog('[dashboard] permission-mode=acceptEdits (네트워크/Bash는 사용자 확인 필요)');

  const proc = spawn(
    claudePath,
    ['--permission-mode', 'acceptEdits', '-p', `/${skill}`],
    {
      cwd,
      env: { ...process.env },
      shell: false,
    }
  );

  proc.stdout.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .forEach((line) => {
        if (line.trim()) sendLog(line);
      });
  });
  proc.stderr.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .forEach((line) => {
        if (line.trim()) sendLog(`[stderr] ${line}`);
      });
  });
  proc.on('close', (code) => {
    sendLog(`[dashboard] 종료 (exit code: ${code ?? 0})`);

    // 파이프라인 스킬 성공 시 진행 상태 기록
    if (code === 0) {
      const pipelineStep = PIPELINE_SKILLS.find((s) => s.skill === skill);
      if (pipelineStep) {
        void recordPipelineProgress(appName, pipelineStep.step).catch(() => {});
      }
    }

    sendDone();
  });
  proc.on('error', (err) => {
    sendLog(`[오류] ${err.message}`);
    sendDone();
  });
  req.on('close', () => {
    if (!proc.killed) proc.kill();
  });
});

// ── 스킬 산출물 자동 감지 ──
async function detectSkillArtifacts(
  appDir: string,
  step: number
): Promise<{ artifacts: Record<string, string>; configUpdates: Record<string, unknown> }> {
  const artifacts: Record<string, string> = {};
  const configUpdates: Record<string, unknown> = {};

  const exists = async (rel: string) => {
    try {
      await fs.access(path.join(appDir, rel));
      return true;
    } catch {
      return false;
    }
  };

  switch (step) {
    case 1: {
      // PRD 파일 감지
      const prdCandidates = ['docs/PRD.md', 'docs/prd.md'];
      for (const c of prdCandidates) {
        if (await exists(c)) {
          artifacts['prd'] = c;
          configUpdates['prdPath'] = c;
          break;
        }
      }
      // glob 패턴: docs/prd/*.md
      if (!artifacts['prd']) {
        try {
          const prdDir = path.join(appDir, 'docs', 'prd');
          const entries = await fs.readdir(prdDir);
          const md = entries.find((e) => e.endsWith('.md'));
          if (md) {
            const rel = `docs/prd/${md}`;
            artifacts['prd'] = rel;
            configUpdates['prdPath'] = rel;
          }
        } catch { /* 디렉토리 없음 */ }
      }
      break;
    }

    case 2: {
      // 에셋 파일 감지
      const logoCandidates = ['assets/logo.png', 'assets/logo.svg'];
      const thumbCandidates = ['assets/thumbnail-wide.png', 'assets/thumbnail-wide.svg'];
      const screenshotCandidates = ['assets/thumbnail-square.png', 'assets/thumbnail-square.svg'];

      for (const c of logoCandidates) {
        if (await exists(c)) {
          artifacts['logo'] = c;
          configUpdates['logoPath'] = c;
          break;
        }
      }
      for (const c of thumbCandidates) {
        if (await exists(c)) {
          artifacts['thumbnail'] = c;
          configUpdates['thumbnailPath'] = c;
          break;
        }
      }
      for (const c of screenshotCandidates) {
        if (await exists(c)) {
          artifacts['screenshot'] = c;
          configUpdates['screenshotPaths'] = [c];
          break;
        }
      }
      break;
    }

    case 7: {
      // .ait 빌드 번들 감지
      if (await exists('.ait')) {
        artifacts['bundle'] = '.ait';
      }
      break;
    }
  }

  return { artifacts, configUpdates };
}

// ── 파이프라인 진행 상태를 .meta-dashboard.json에 기록 ──
async function recordPipelineProgress(appName: string, step: number): Promise<void> {
  const appDir = path.join(APPS_DIR, appName);
  const metaPath = path.join(appDir, '.meta-dashboard.json');

  await withWriteLock(appName, async () => {
    let meta: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      meta = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // 파일이 없으면 새로 생성
    }

    // 산출물 감지
    const { artifacts, configUpdates } = await detectSkillArtifacts(appDir, step);

    // 파이프라인 진행 상태 기록
    const progress = (meta['pipelineProgress'] as Record<string, unknown>) ?? {};
    progress[String(step)] = {
      completedAt: new Date().toISOString().slice(0, 10),
      ...(Object.keys(artifacts).length > 0 ? { artifacts } : {}),
    };
    meta['pipelineProgress'] = progress;
    meta['updatedAt'] = new Date().toISOString().slice(0, 10);

    // 스킬 산출물 경로를 config 필드에도 반영
    for (const [key, value] of Object.entries(configUpdates)) {
      // 기존 값이 없거나 빈 값인 경우에만 덮어쓰기
      if (!meta[key]) {
        meta[key] = value;
      }
    }

    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  });
}

export { router as runSkillRouter };
