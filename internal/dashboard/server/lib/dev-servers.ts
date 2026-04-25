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

/**
 * 짧게 GET 해서 응답 코드 + 본문(최대 4KB)을 반환. 타임아웃·에러 시 null.
 * pingPort 의 헬퍼 — 단순 살아있음 체크와 vite 시그니처 검증을 모두 본문 분석으로 처리.
 */
function fetchHead(
  port: number,
  pathname: string,
  timeoutMs: number
): Promise<{ statusCode: number; body: string } | null> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method: 'GET', timeout: timeoutMs },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 4096) res.destroy();
        });
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }));
        res.on('error', () => resolve(null));
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * 포트가 응답하는지 + **vite dev 서버 시그니처가 맞는지** 검증.
 *
 * 단순히 HTTP 응답이 온다는 사실만으로 external 로 분류하면, 사용자가 같은 포트에서 운영
 * 중인 무관한 서버(예: 다른 프로젝트 backend)를 ait-screenshots 가 그대로 캡처해 의도와
 * 다른 화면이 콘솔에 등록되는 사고가 가능하다. vite 만 가지는 `/@vite/client` 모듈
 * 응답이나 루트 HTML 안의 `/@vite/` 마크업으로 dev 서버임을 확정한다.
 */
function pingPort(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    void (async () => {
      const root = await fetchHead(port, '/', timeoutMs);
      if (!root || root.statusCode < 200 || root.statusCode >= 500) {
        resolve(false);
        return;
      }
      // 빠른 통과: 루트 HTML 에 vite 마크업이 박혀 있으면 vite 확정.
      if (/\/@vite\//i.test(root.body)) {
        resolve(true);
        return;
      }
      // 보강: `/@vite/client` 가 200 + JS module 시그니처면 vite 확정.
      const sig = await fetchHead(port, '/@vite/client', timeoutMs);
      if (
        sig &&
        sig.statusCode === 200 &&
        /\b(import|HMRPayload|createHotContext)\b/.test(sig.body)
      ) {
        resolve(true);
        return;
      }
      // 응답은 오는데 vite 흔적이 없으면 무관한 서버 — false 처리.
      resolve(false);
    })();
  });
}

/** 포트가 살아날 때까지 폴링. 성공이면 true, 타임아웃이면 false. */
async function waitForPort(port: number, totalMs = 60_000, intervalMs = 500): Promise<boolean> {
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

  // 같은 포트를 다른 앱이 이미 dashboard 관리하에 점유하고 있으면 충돌. 사용자가 ait-screenshots 를
  // 잘못된 앱 화면으로 캡처하는 사고를 막는다. (granite.config.ts 의 web.port 가 두 앱에서 같은 경우)
  for (const [otherApp, info] of managed) {
    if (otherApp !== appName && info.port === port) {
      return {
        appName,
        port,
        status: 'failed',
        startedAt: null,
        managed: false,
        lastError: `포트 ${port} 가 이미 다른 앱(${otherApp}) 의 dev 서버에 사용 중이에요. ${appName} 의 granite.config.ts 에서 web.port 를 다른 값으로 바꾸거나 ${otherApp} dev 서버를 먼저 종료해주세요.`,
      };
    }
  }

  // 이미 외부에서 띄운 dev 서버가 있으면 그대로 쓴다 (이중 spawn 방지).
  // pingPort 는 vite 시그니처까지 확인하므로 무관한 서버를 잘못 'external' 로 분류하지 않는다.
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

  // 포트가 살아날 때까지 비동기로 기다리되, 호출자에는 starting 상태로 즉시 반환.
  // cold start (npm 캐시 미존재 + dep optimization + Chromium 다운로드 등) 를 고려해 60초 timeout.
  void (async () => {
    const TIMEOUT_MS = 60_000;
    const ok = await waitForPort(port, TIMEOUT_MS);
    if (!managed.has(appName)) return; // 그 사이에 stop 됐을 수 있음
    if (ok) {
      tracked.status = 'running';
    } else {
      tracked.status = 'failed';
      tracked.lastError = `${port} 포트가 ${TIMEOUT_MS / 1000}초 안에 vite dev 서버로 응답하지 않았어요. ${tracked.buffer.slice(-300) || '로그 없음'}`;
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

/**
 * dashboard 종료 훅 — 관리 중인 모든 dev 서버 정리.
 * 각 자식에 SIGTERM 보내고 exit 이벤트를 최대 5초 기다린다.
 * 끝까지 안 죽으면 SIGKILL. 모든 자식이 정리될 때까지 await 가능.
 */
export async function cleanupAllDevServers(timeoutMs = 5_000): Promise<void> {
  const entries = Array.from(managed.entries());
  managed.clear();

  await Promise.all(
    entries.map(
      ([, tracked]) =>
        new Promise<void>((resolve) => {
          if (tracked.proc.exitCode !== null || tracked.proc.signalCode !== null) {
            resolve();
            return;
          }
          const timer = setTimeout(() => {
            try {
              tracked.proc.kill('SIGKILL');
            } catch {
              /* 이미 죽었음 */
            }
            resolve();
          }, timeoutMs);
          tracked.proc.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          try {
            tracked.proc.kill('SIGTERM');
          } catch {
            // 이미 죽었으면 exit 이 안 올 수도 있어 즉시 resolve
            clearTimeout(timer);
            resolve();
          }
        })
    )
  );
}
