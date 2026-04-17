import chokidar from 'chokidar';
import path from 'path';
import { broadcast } from './sse.js';

const APPS_DIR = path.resolve(process.cwd(), '../../apps');

function debounce<T extends (...args: string[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: string[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

// chokidar glob 패턴은 POSIX 스타일 슬래시를 요구하므로 Windows에서도 정방향 슬래시로 변환
function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export function createWatcher() {
  const appsDirPosix = toPosix(APPS_DIR);
  const patterns = [
    `${appsDirPosix}/*/.meta-dashboard.json`,
    `${appsDirPosix}/*/.ait`,
  ];

  console.log('[watcher] apps/*/.meta-dashboard.json, .ait 동적 감시 시작');

  const watcher = chokidar.watch(patterns, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  const debounced = debounce((filePath: string) => {
    console.log(`[watcher] 변경 감지: ${filePath}`);
    broadcast('refresh', 'changed');
  }, 500);

  watcher.on('add', debounced);
  watcher.on('change', debounced);
  watcher.on('unlink', debounced);

  return watcher;
}
