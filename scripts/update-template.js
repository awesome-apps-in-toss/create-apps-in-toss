#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const UPSTREAM_URL = 'https://github.com/Awesome-Apps-in-Toss/create-apps-in-toss.git';
const UPSTREAM_URL_FRAGMENT = 'Awesome-Apps-in-Toss/create-apps-in-toss';
const UPSTREAM_BRANCH = process.env.BARRELEYE_TEMPLATE_BRANCH || 'main';
const SYNC_IGNORE_FILE = '.barreleye-sync-ignore';
const MANIFEST_FILE = '.barreleye-template.json';

const SYNC_PATHS = [
  '.claude',
  '.husky',
  'scripts',
  'packages',
  'docs',
  'internal/dashboard',
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

const args = process.argv.slice(2);
const ALLOW_HEAD_FALLBACK = args.includes('--allow-head-fallback');

function sh(cmd, opts = {}) {
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  return typeof out === 'string' ? out.trim() : '';
}

function tryShell(cmd, opts = {}) {
  try {
    return { ok: true, out: sh(cmd, opts) };
  } catch (e) {
    return { ok: false, err: e.stderr?.toString() ?? e.message };
  }
}

function git(argv) {
  const r = spawnSync('git', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  return {
    ok: r.status === 0,
    out: (r.stdout || '').trim(),
    err: (r.stderr || '').trim() || (r.error?.message ?? ''),
  };
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

function readManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch {
    console.warn(`[update-template] ⚠️  ${MANIFEST_FILE} 파싱 실패 — 무시`);
    return null;
  }
}

function writeManifest(data) {
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(data, null, 2) + '\n');
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

function resolveBaseline(remote) {
  const manifest = readManifest();
  if (manifest?.sha) {
    return { sha: manifest.sha, source: 'manifest', manifest };
  }

  console.log(`[update-template] ${MANIFEST_FILE} 없음 — baseline 자동 추정`);
  const mb = git(['merge-base', `${remote}/${UPSTREAM_BRANCH}`, 'HEAD']);
  if (mb.ok && mb.out) {
    console.log(`[update-template]  · merge-base ${remote}/${UPSTREAM_BRANCH} HEAD = ${mb.out.slice(0, 7)}`);
    return { sha: mb.out, source: 'merge-base', manifest: null };
  }

  if (!ALLOW_HEAD_FALLBACK) {
    console.error('[update-template] ❌ baseline SHA를 결정할 수 없습니다.');
    console.error('   manifest(.barreleye-template.json)도 없고 merge-base도 실패했습니다.');
    console.error('   HEAD를 baseline으로 쓰면 사용자가 추가한 tracked 파일이 삭제될 수 있습니다.');
    console.error('   의도적으로 진행하려면: pnpm update-template --allow-head-fallback');
    process.exit(1);
  }

  const head = git(['rev-parse', 'HEAD']);
  if (head.ok) {
    console.warn(`[update-template] ⚠️  HEAD fallback: ${head.out.slice(0, 7)} — 로컬 추가 파일이 삭제될 수 있음`);
    return { sha: head.out, source: 'head-fallback', manifest: null };
  }

  throw new Error('baseline SHA를 결정할 수 없습니다.');
}

function syncPath(baseline, target, p) {
  const deletedR = git(['diff', '--name-only', '--diff-filter=D', `${baseline}..${target}`, '--', p]);
  if (deletedR.ok && deletedR.out) {
    for (const f of deletedR.out.split('\n').filter(Boolean)) {
      if (!fs.existsSync(f)) continue;
      const rm = git(['rm', '-f', '--', f]);
      if (!rm.ok) {
        console.warn(`[update-template]  ⚠ rm 실패: ${f} (${rm.err.split('\n')[0]})`);
      }
    }
  }

  const r = git(['checkout', target, '--', p]);
  if (!r.ok) return { ok: false, err: r.err };

  const diff = git(['diff', '--cached', '--name-only', '--', p]);
  const count = diff.ok && diff.out ? diff.out.split('\n').filter(Boolean).length : 0;
  return { ok: true, count };
}

function notifyLegacyDashboard() {
  if (!fs.existsSync('apps/dashboard')) return;
  console.warn('\n[update-template] ⚠️  레거시 경로 감지: apps/dashboard/');
  console.warn('   대시보드는 internal/dashboard/ 로 이전되었습니다.');
  console.warn('   로컬 변경을 확인 후 수동으로 제거하세요:');
  console.warn('     git diff apps/dashboard internal/dashboard   # 로컬 커스터마이징 비교');
  console.warn('     git rm -r apps/dashboard                     # 확인 후 제거');
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

  const latest = sh('git rev-parse FETCH_HEAD');
  const { sha: baseline, source } = resolveBaseline(remote);

  if (baseline === latest) {
    console.log('[update-template] ✅ 이미 최신 상태입니다. (baseline === upstream)');
    updateCooldownTimestamp();
    notifyLegacyDashboard();
    return;
  }

  console.log(
    `[update-template] baseline ${baseline.slice(0, 7)} (${source}) → upstream ${latest.slice(0, 7)}`
  );

  let changed = 0;
  for (const p of SYNC_PATHS) {
    if (isIgnored(p, ignorePatterns)) {
      console.log(`[update-template]  · skip ${p} (ignored)`);
      continue;
    }
    const r = syncPath(baseline, latest, p);
    if (!r.ok) {
      console.warn(`[update-template]  · skip ${p} (${r.err.split('\n')[0]})`);
      continue;
    }
    if (r.count > 0) {
      changed += r.count;
      console.log(`[update-template]  · ${p} (${r.count} files)`);
    }
  }

  git(['reset', 'HEAD', '--']);

  writeManifest({
    repository: UPSTREAM_URL_FRAGMENT,
    branch: UPSTREAM_BRANCH,
    sha: latest,
    updatedAt: new Date().toISOString(),
  });

  if (changed === 0) {
    console.log(`[update-template] ✅ 코드 변경 없음. ${MANIFEST_FILE}만 ${latest.slice(0, 7)}로 업데이트.`);
    updateCooldownTimestamp();
    notifyLegacyDashboard();
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
  console.log(`  git add -A && git commit -m "chore: sync template to ${latest.slice(0, 7)}"`);
  console.log(`\n⚠️  apps/* / package.json / README.md / pnpm-lock.yaml은 동기화 대상이 아닙니다.`);
  console.log('   upstream의 scripts 필드에 새 항목이 있다면 수동으로 반영하세요:');
  console.log(`   git show ${remote}/${UPSTREAM_BRANCH}:package.json`);

  notifyLegacyDashboard();
}

main();
