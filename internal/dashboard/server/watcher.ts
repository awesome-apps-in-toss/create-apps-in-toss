import chokidar from 'chokidar';
import path from 'path';
import { readdirSync } from 'fs';
import { broadcast } from './sse.js';

const APPS_DIR = path.resolve(process.cwd(), '../');

function debounce<T extends (...args: string[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: string[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function getWatchFiles(): string[] {
  try {
    const entries = readdirSync(APPS_DIR, { withFileTypes: true });
    const files: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || e.name === 'dashboard') continue;
      files.push(path.join(APPS_DIR, e.name, '.meta-dashboard.json'));
      files.push(path.join(APPS_DIR, e.name, '.ait'));
    }
    return files;
  } catch {
    return [];
  }
}

export function createWatcher() {
  const files = getWatchFiles();
  console.log(`[watcher] ${files.length}개 파일 감지 시작`);

  const watcher = chokidar.watch(files, {
    ignoreInitial: true,
    persistent: true,
    dot: true,
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
