import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import http from 'http';

/**
 * 앱별 dev 서버 lifecycle 을 dashboard 가 직접 관리한다.
 * 비개발자가 ait-screenshots 단계를 위해 별도 터미널을 열 필요 없게 하기 위한 것.
 *
 * 정책:
 *   - granite.config.ts 의 web.port 로 이미 응답하는 서버가 있으면 그대로 사용 (사용자가 수동으로 띄운 케이스)
 *   - 없으면 `pnpm --filter @barreleye/<name> dev` 를 spawn 해서 자식 프로세스로 보유
 *   - dashboard 종료 시 모든 자식 프로세스 SIGTERM
 */

export type DevServerStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'failed'
  | 'external'; // 사용자가 미리 띄워둔 외부 프로세스

export interface DevServerInfo {
  appName: string;
  port: number | null;
  status: DevServerStatus;
  startedAt: string | null;
  managed: boolean; // dashboard 가 spawn 한 것이면 true
  lastError: string | null;
}

interface ManagedProcess {
  proc: ChildProcess;
  port: number;
  startedAt: string;
  status: DevServerStatus;
  lastError: string | null;
  buffer: string; // 최근 로그 (디버깅용)
}

const managed = new Map<string, ManagedProcess>();

/** granite.config.ts 의 web.port 추출. 없으면 null. */
async function readWebPort(appDir: string): Promise<number | null> {
  try {
    const text = await fs.readFile(path.join(appDir, 'granite.config.ts'), 'utf-8');
    const m = text.match(/web:\s*\{[^}]*port:\s*(\d+)/s);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** 포트가 HTTP 응답을 주는지 (200~399) 짧게 확인. */
function pingPort(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/', method: 'GET', timeout: timeoutMs },
      (res) => {
        const code = res.statusCode ?? 0;
        res.resume();
        resolve(code >= 200 && code < 500); // dev 서버는 보통 200, vite 프록시는 404 도 가능 — "응답한다" 는 사실이 중요
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/** 포트가 살아날 때까지 폴링. 성공이면 true, 타임아웃이면 false. */
async function waitForPort(port: number, totalMs = 30_000, intervalMs = 500): Promise<boolean> {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    if (await pingPort(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * 앱의 dev 서버 상태를 조회. 자식 프로세스 보유 중이면 그 정보, 아니면 외부 포트 헬스체크 결과.
 */
export async function getDevServerStatus(
  appName: string,
  appDir: string
): Promise<DevServerInfo> {
  const tracked = managed.get(appName);
  const port = tracked?.port ?? (await readWebPort(appDir));

  if (tracked) {
    return {
      appName,
      port: tracked.port,
      status: tracked.status,
      startedAt: tracked.startedAt,
      managed: true,
      lastError: tracked.lastError,
    };
  }

  if (port && (await pingPort(port))) {
    return {
      appName,
      port,
      status: 'external',
      startedAt: null,
      managed: false,
      lastError: null,
    };
  }

  return {
    appName,
    port,
    status: 'stopped',
    startedAt: null,
    managed: false,
    lastError: null,
  };
}

/**
 * dev 서버 기동. 이미 관리 중이거나 외부 포트가 살아있으면 그 상태를 그대로 반환.
 */
export async function startDevServer(
  appName: string,
  appDir: string,
  packageName: string
): Promise<DevServerInfo> {
  // 이미 관리 중이면 상태만 반환
  const existing = managed.get(appName);
  if (existing && (existing.status === 'starting' || existing.status === 'running')) {
    return getDevServerStatus(appName, appDir);
  }

  const port = await readWebPort(appDir);
  if (!port) {
    return {
      appName,
      port: null,
      status: 'failed',
      startedAt: null,
      managed: false,
      lastError: 'granite.config.ts 에서 web.port 를 찾지 못했어요. 스캐폴딩이 끝났는지 확인해 주세요.',
    };
  }

  // 이미 외부에서 띄운 dev 서버가 있으면 그대로 쓴다 (이중 spawn 방지)
  if (await pingPort(port)) {
    return {
      appName,
      port,
      status: 'external',
      startedAt: null,
      managed: false,
      lastError: null,
    };
  }

  // 새로 spawn
  const startedAt = new Date().toISOString();
  const proc = spawn('pnpm', ['--filter', packageName, 'dev'], {
    cwd: path.resolve(appDir, '../..'), // monorepo root
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
    detached: false,
  });

  const tracked: ManagedProcess = {
    proc,
    port,
    startedAt,
    status: 'starting',
    lastError: null,
    buffer: '',
  };
  managed.set(appName, tracked);

  proc.stdout?.on('data', (chunk: Buffer) => {
    tracked.buffer = (tracked.buffer + chunk.toString()).slice(-4096);
  });
  proc.stderr?.on('data', (chunk: Buffer) => {
    tracked.buffer = (tracked.buffer + chunk.toString()).slice(-4096);
  });
  proc.on('exit', (code, signal) => {
    if (tracked.status === 'starting' || tracked.status === 'running') {
      tracked.status = 'failed';
      tracked.lastError = `dev 서버가 종료됐어요 (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`;
    }
    // managed 에 그대로 두지 않고 비워서 다음 start 가 신선하게 시작하게 한다
    if (managed.get(appName) === tracked) managed.delete(appName);
  });

  // 포트가 살아날 때까지 비동기로 기다리되, 호출자에는 starting 상태로 즉시 반환
  void (async () => {
    const ok = await waitForPort(port, 30_000);
    if (!managed.has(appName)) return; // 그 사이에 stop 됐을 수 있음
    if (ok) {
      tracked.status = 'running';
    } else {
      tracked.status = 'failed';
      tracked.lastError = `${port} 포트가 30초 안에 응답하지 않았어요. ${tracked.buffer.slice(-300) || '로그 없음'}`;
      // spawn 한 프로세스는 죽이고 정리
      proc.kill('SIGTERM');
    }
  })();

  return {
    appName,
    port,
    status: 'starting',
    startedAt,
    managed: true,
    lastError: null,
  };
}

/** dashboard 가 spawn 한 dev 서버를 종료. 외부 프로세스는 건드리지 않는다. */
export async function stopDevServer(appName: string): Promise<DevServerInfo> {
  const tracked = managed.get(appName);
  if (!tracked) {
    return {
      appName,
      port: null,
      status: 'stopped',
      startedAt: null,
      managed: false,
      lastError: null,
    };
  }
  tracked.proc.kill('SIGTERM');
  // 강제 정리 (5초 후에도 살아있으면 SIGKILL)
  setTimeout(() => {
    if (!tracked.proc.killed) tracked.proc.kill('SIGKILL');
  }, 5000).unref();
  managed.delete(appName);
  return {
    appName,
    port: tracked.port,
    status: 'stopped',
    startedAt: tracked.startedAt,
    managed: true,
    lastError: null,
  };
}

/** dashboard 종료 훅 — 관리 중인 모든 dev 서버 정리. */
export function cleanupAllDevServers(): void {
  for (const [name, tracked] of managed) {
    try {
      tracked.proc.kill('SIGTERM');
    } catch {
      // 이미 죽었을 수 있음
    }
    managed.delete(name);
  }
}
