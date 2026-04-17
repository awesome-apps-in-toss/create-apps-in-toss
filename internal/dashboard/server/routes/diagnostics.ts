import { Router } from 'express';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

const router: Router = Router();

interface ClaudeDiagnostic {
  found: boolean;
  path: string | null;
  version: string | null;
  /** OAuth 로그인 추정치. Claude CLI에 공식 programmatic whoami가 없어서 파일 기반 추정. */
  loggedIn: 'yes' | 'no' | 'unknown';
  /** 사용자에게 보여줄 한 줄 상태 요약. */
  message: string;
  /** OS/platform 정보 — 디버깅 지원용. */
  platform: {
    os: string;
    arch: string;
    node: string;
  };
}

function findClaudeExecutable(): string | null {
  const probe = process.platform === 'win32' ? 'where claude' : 'which claude';
  try {
    const out = execSync(probe, { encoding: 'utf-8' }).split(/\r?\n/)[0]?.trim();
    return out || null;
  } catch {
    return null;
  }
}

async function probeVersion(claudePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(claudePath, ['--version'], {
      timeout: 4000,
      shell: process.platform === 'win32',
    });
    const text = stdout.trim();
    return text || null;
  } catch {
    return null;
  }
}

async function probeLogin(): Promise<'yes' | 'no' | 'unknown'> {
  // Claude CLI 는 ~/.claude 하위에 세션/자격 증명 관련 파일을 둔다.
  // 구체 파일명은 버전마다 달라질 수 있어 '존재 여부'만으로 추정한다.
  const home = os.homedir();
  const candidates = [
    path.join(home, '.claude', 'auth.json'),
    path.join(home, '.claude', 'credentials.json'),
    path.join(home, '.claude', 'session.json'),
    path.join(home, '.claude', 'oauth.json'),
  ];
  for (const p of candidates) {
    try {
      const stat = await fs.stat(p);
      if (stat.isFile() && stat.size > 0) return 'yes';
    } catch {
      // miss
    }
  }
  // 디렉터리 자체라도 있으면 CLI 써본 흔적 → unknown
  try {
    const dirStat = await fs.stat(path.join(home, '.claude'));
    if (dirStat.isDirectory()) return 'unknown';
  } catch {
    /* nothing */
  }
  return 'no';
}

// GET /api/diagnostics/claude
router.get('/claude', async (_req, res) => {
  const claudePath = findClaudeExecutable();
  const diag: ClaudeDiagnostic = {
    found: !!claudePath,
    path: claudePath,
    version: null,
    loggedIn: 'unknown',
    message: '',
    platform: {
      os: `${process.platform} ${os.release()}`,
      arch: process.arch,
      node: process.version,
    },
  };

  if (!claudePath) {
    diag.message = 'Claude CLI 를 찾지 못했습니다. https://docs.claude.com/claude-code 설치 가이드를 확인하세요.';
    res.json(diag);
    return;
  }

  const [version, loggedIn] = await Promise.all([probeVersion(claudePath), probeLogin()]);
  diag.version = version;
  diag.loggedIn = loggedIn;

  if (loggedIn === 'no') {
    diag.message = 'Claude CLI 에 로그인되어 있지 않은 것으로 보입니다. 터미널에서 `claude /login` 을 실행해 주세요.';
  } else if (loggedIn === 'unknown') {
    diag.message = 'Claude CLI 가 설치되어 있습니다. 로그인 상태는 확인할 수 없었습니다 — `claude -p "hello"` 로 점검해 보세요.';
  } else {
    diag.message = version ? `Claude CLI 준비 완료 (${version})` : 'Claude CLI 준비 완료';
  }

  res.json(diag);
});

export { router as diagnosticsRouter };
export type { ClaudeDiagnostic };
