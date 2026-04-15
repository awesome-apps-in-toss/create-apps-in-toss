#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.env.CI || process.env.BARRELEYE_SKIP_TEMPLATE_CHECK) process.exit(0);

const UPSTREAM_URL_FRAGMENT = 'Awesome-Apps-in-Toss/create-apps-in-toss';
const BRANCH = process.env.BARRELEYE_TEMPLATE_BRANCH || 'main';
const NETWORK_TIMEOUT_MS = 3000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_FILE = path.join('node_modules', '.cache', 'barreleye-template-check');

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim();
}

function silent(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

// 쿨다운: 24h 내 체크했으면 skip (rate limit / 네트워크 비용 절약)
const lastCheck = silent(() => Number(fs.readFileSync(CACHE_FILE, 'utf8')));
if (lastCheck && Date.now() - lastCheck < COOLDOWN_MS) process.exit(0);

function writeCooldown() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, String(Date.now()));
  } catch {
    // ignore
  }
}

function resolveRemote() {
  const upstream = silent(() => sh('git remote get-url upstream'));
  if (upstream && upstream.includes(UPSTREAM_URL_FRAGMENT)) return 'upstream';
  const origin = silent(() => sh('git remote get-url origin'));
  if (origin && origin.includes(UPSTREAM_URL_FRAGMENT)) return 'origin';
  return null;
}

const remote = resolveRemote();
if (!remote) {
  writeCooldown();
  process.exit(0);
}

// shallow fetch로 upstream SHA를 로컬에 확보 (timeout으로 offline/사내망 보호)
const fetched = silent(() =>
  execSync(`git fetch --depth=1 ${remote} ${BRANCH}`, {
    stdio: 'ignore',
    timeout: NETWORK_TIMEOUT_MS,
  })
);
if (fetched === null) {
  writeCooldown();
  process.exit(0);
}

const remoteSha = silent(() => sh('git rev-parse FETCH_HEAD'));
if (!remoteSha) {
  writeCooldown();
  process.exit(0);
}

const headSha = silent(() => sh('git rev-parse HEAD'));
if (headSha === remoteSha) {
  writeCooldown();
  process.exit(0);
}

const isAncestor = silent(() =>
  execSync(`git merge-base --is-ancestor ${remoteSha} HEAD`, { stdio: 'ignore' })
);

writeCooldown();

// is-ancestor: 성공(exit 0) = upstream이 HEAD에 포함됨 = 최신, 실패 = 업데이트 있음
if (isAncestor !== null) process.exit(0);

console.log('');
console.log('📦 [barreleye] 템플릿에 새 업데이트가 있습니다.');
console.log('   최신 스킬·스크립트·대시보드를 받으려면:');
console.log('   $ pnpm update-template');
console.log('');
console.log('   (이 알림은 24시간 후 다시 나타납니다. 끄려면 BARRELEYE_SKIP_TEMPLATE_CHECK=1)');
console.log('');
