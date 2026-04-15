#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const UPSTREAM_URL = 'https://github.com/Awesome-Apps-in-Toss/create-apps-in-toss.git';
const UPSTREAM_URL_FRAGMENT = 'Awesome-Apps-in-Toss/create-apps-in-toss';
const UPSTREAM_BRANCH = process.env.BARRELEYE_TEMPLATE_BRANCH || 'main';
const SYNC_IGNORE_FILE = '.barreleye-sync-ignore';

const SYNC_PATHS = [
  '.claude',
  '.husky',
  'scripts',
  'packages',
  'docs',
  'apps/dashboard',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.json',
  'eslint.config.js',
  'vercel.json',
  '.gitignore',
  '.gitattributes',
  'CLAUDE.md',
  'AGENTS.md',
];

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function tryShell(cmd, opts = {}) {
  try {
    return { ok: true, out: sh(cmd, opts) };
  } catch (e) {
    return { ok: false, err: e.stderr?.toString() ?? e.message };
  }
}

function loadIgnorePatterns() {
  if (!fs.existsSync(SYNC_IGNORE_FILE)) return [];
  return fs
    .readFileSync(SYNC_IGNORE_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function isIgnored(p, patterns) {
  return patterns.some((pat) => p === pat || p.startsWith(pat.replace(/\/$/, '') + '/'));
}

function validateUpstreamUrl(url) {
  if (!url.includes(UPSTREAM_URL_FRAGMENT)) {
    console.error(`[update-template] ❌ upstream remote URL이 예상과 다릅니다: ${url}`);
    console.error(`   기대: ${UPSTREAM_URL_FRAGMENT}`);
    console.error(`   수정: git remote set-url upstream ${UPSTREAM_URL}`);
    process.exit(1);
  }
}

function resolveUpstreamRemote() {
  const upstream = tryShell('git remote get-url upstream');
  if (upstream.ok) {
    validateUpstreamUrl(upstream.out);
    return 'upstream';
  }

  const origin = tryShell('git remote get-url origin');
  if (origin.ok && origin.out.includes(UPSTREAM_URL_FRAGMENT)) {
    return 'origin';
  }

  console.log(`[update-template] 'upstream' remote가 없어 추가합니다: ${UPSTREAM_URL}`);
  sh(`git remote add upstream ${UPSTREAM_URL}`, { stdio: 'inherit' });
  return 'upstream';
}

function ensureNoModifiedTracked() {
  const status = sh('git status --porcelain');
  const blocking = status
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.startsWith('??'));
  if (blocking.length > 0) {
    console.error('[update-template] 수정/스테이징된 변경사항이 있습니다. 커밋 또는 stash 후 재실행하세요.');
    console.error(blocking.join('\n'));
    process.exit(1);
  }
}

function warnAutocrlf() {
  const v = tryShell('git config --get core.autocrlf');
  if (v.ok && v.out === 'true') {
    console.warn('[update-template] ⚠️  core.autocrlf=true 상태입니다. CRLF 변환으로 불필요한 diff가 생길 수 있습니다.');
    console.warn('   권장: git config core.autocrlf input');
  }
}

function syncPath(ref, p) {
  // upstream에 없는 파일은 로컬에서 삭제 (A = local에 있고 upstream에 없음)
  const deletedR = tryShell(`git diff --name-only --diff-filter=A ${ref}..HEAD -- "${p}"`);
  if (deletedR.ok && deletedR.out) {
    for (const f of deletedR.out.split('\n').filter(Boolean)) {
      const rm = tryShell(`git rm -f -- "${f}"`);
      if (!rm.ok) {
        console.warn(`[update-template]  ⚠ rm 실패: ${f} (${rm.err.split('\n')[0]})`);
      }
    }
  }

  const r = tryShell(`git checkout ${ref} -- "${p}"`);
  if (!r.ok) return { ok: false, err: r.err };

  const diff = tryShell(`git diff --cached --name-only -- "${p}"`);
  const count = diff.ok && diff.out ? diff.out.split('\n').filter(Boolean).length : 0;
  return { ok: true, count };
}

function updateCooldownTimestamp() {
  const cacheDir = path.join('node_modules', '.cache');
  const cacheFile = path.join(cacheDir, 'barreleye-template-check');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, String(Date.now()));
  } catch {
    // node_modules가 아직 없을 수 있음 — 무시
  }
}

function main() {
  ensureNoModifiedTracked();
  warnAutocrlf();
  const remote = resolveUpstreamRemote();
  const ignorePatterns = loadIgnorePatterns();
  if (ignorePatterns.length > 0) {
    console.log(`[update-template] ${SYNC_IGNORE_FILE}에서 ${ignorePatterns.length}개 패턴 제외`);
  }

  console.log(`[update-template] ${remote}/${UPSTREAM_BRANCH} fetch 중...`);
  sh(`git fetch ${remote} ${UPSTREAM_BRANCH}`, { stdio: 'inherit' });

  // FETCH_HEAD가 가장 신뢰도 높음 (remote-tracking ref 갱신은 git config에 의존)
  const ref = sh('git rev-parse FETCH_HEAD');
  let changed = 0;

  for (const p of SYNC_PATHS) {
    if (isIgnored(p, ignorePatterns)) {
      console.log(`[update-template]  · skip ${p} (ignored)`);
      continue;
    }
    const r = syncPath(ref, p);
    if (!r.ok) {
      console.warn(`[update-template]  · skip ${p} (${r.err.split('\n')[0]})`);
      continue;
    }
    if (r.count > 0) {
      changed += r.count;
      console.log(`[update-template]  · ${p} (${r.count} files)`);
    }
  }

  // staged 상태를 unstage (워킹트리는 유지)
  tryShell('git reset HEAD --');

  if (changed === 0) {
    console.log('[update-template] ✅ 이미 최신 상태입니다.');
    updateCooldownTimestamp();
    return;
  }

  console.log(`[update-template] 총 ${changed}개 파일 업데이트됨. pnpm install 실행...`);
  const installed = spawnSync('pnpm', ['install'], { stdio: 'inherit', shell: true });
  if (installed.status !== 0) {
    console.warn('[update-template] pnpm install 실패. 수동으로 실행해주세요.');
  }

  updateCooldownTimestamp();

  console.log('\n[update-template] 🎉 완료. 변경사항은 unstaged 상태로 워킹트리에 있습니다:');
  console.log('  git status');
  console.log('  git diff');
  console.log('  git add -A && git commit -m "chore: sync template from upstream"');
  console.log('\n⚠️  package.json / README.md / pnpm-lock.yaml은 동기화 대상이 아닙니다.');
  console.log('   upstream의 scripts 필드에 새 항목이 있다면 수동으로 반영하세요:');
  console.log(`   git show ${remote}/${UPSTREAM_BRANCH}:package.json`);
}

main();
