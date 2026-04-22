#!/usr/bin/env node
// Preflight environment check for Claude skills & agents.
// Usage: node scripts/preflight.js [--json] [--app <name>]

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const appIdx = args.indexOf('--app');
const appName = appIdx >= 0 && args[appIdx + 1] ? args[appIdx + 1] : null;

const checks = [];
function record(category, name, status, detail = '') {
  checks.push({ category, name, status, detail });
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// ========== 시스템 ==========

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
record('시스템', `node v${process.versions.node}`, nodeMajor >= 20 ? 'pass' : 'fail',
  nodeMajor >= 20 ? '' : '≥ 20 필요');

for (const cmd of ['pnpm', 'git', 'curl']) {
  const path = tryExec(`command -v ${cmd}`);
  record('시스템', cmd, path ? 'pass' : 'fail', path || '미설치');
}

// ========== Claude Code ==========

const mcpStandard = existsSync(resolve(rootDir, '.mcp.json'));
const mcpLegacy = existsSync(resolve(rootDir, '.claude/mcp.json'));

record('Claude Code', '.mcp.json (루트 표준)', mcpStandard ? 'pass' : 'fail',
  mcpStandard ? '' : '프로젝트 루트에 없음 — Claude Code가 MCP를 인식하지 못함');

if (mcpLegacy) {
  record('Claude Code', '.claude/mcp.json (레거시)', 'warn',
    '루트 .mcp.json 사용 권장 (git mv .claude/mcp.json .mcp.json)');
}

const mcpListOut = tryExec('claude mcp list 2>&1');
if (mcpListOut === null) {
  record('Claude Code', 'claude CLI', 'warn', '실행 실패 — MCP 상태 확인 불가');
} else {
  const puppeteerOk = /puppeteer.*Connected/i.test(mcpListOut);
  record('Claude Code', 'puppeteer MCP', puppeteerOk ? 'pass' : 'fail',
    puppeteerOk ? '' : '연결 안됨 — Claude Code 재시작 또는 최초 승인 필요');
}

// ========== 에셋 도구 ==========

function checkNpxCached(pkg, label) {
  const found = tryExec(
    `find "$HOME/.npm/_npx" -maxdepth 4 -type d -name '${pkg}' 2>/dev/null | head -1`
  );
  record('에셋 도구', label, found ? 'pass' : 'warn',
    found ? 'npx 캐시됨' : '첫 실행 시 다운로드 필요 (네트워크)');
}

checkNpxCached('sharp-cli', 'sharp-cli (로고 SVG→PNG)');
checkNpxCached('capture-website-cli', 'capture-website-cli (HTML→PNG fallback)');

const hasPuppeteerDep = existsSync(resolve(rootDir, 'node_modules/puppeteer/package.json'));
record('에셋 도구', 'puppeteer (루트 devDep)', hasPuppeteerDep ? 'pass' : 'warn',
  hasPuppeteerDep ? '' : 'pnpm install 필요');

for (const cmd of ['jq', 'python3']) {
  const path = tryExec(`command -v ${cmd}`);
  const role = cmd === 'jq' ? 'DALL-E b64 디코딩' : 'jq 없을 때 대체';
  record('에셋 도구', cmd, path ? 'pass' : 'warn', path || role);
}

// ========== 환경변수 ==========

const envPath = resolve(rootDir, '.env');
const envExampleExists = existsSync(resolve(rootDir, '.env.example'));
const envExists = existsSync(envPath);

record('환경변수', '.env 파일', envExists ? 'pass' : 'warn',
  envExists ? '' : (envExampleExists ? 'cp .env.example .env 로 생성' : '.env.example도 없음'));

if (envExists) {
  const envContent = readFileSync(envPath, 'utf8');
  const hasOpenAi = /^OPENAI_API_KEY=\S+/m.test(envContent);
  record('환경변수', 'OPENAI_API_KEY', hasOpenAi ? 'pass' : 'warn',
    hasOpenAi ? '' : '캐릭터·일러스트 생성만 영향 (optional)');
}

// ========== 앱별 (optional) ==========

if (appName) {
  const appDir = resolve(rootDir, 'apps', appName);
  if (existsSync(appDir)) {
    record('앱', `apps/${appName}`, 'pass');
    for (const file of ['granite.config.ts', 'package.json']) {
      record('앱', `${appName}/${file}`,
        existsSync(resolve(appDir, file)) ? 'pass' : 'warn');
    }
  } else {
    record('앱', `apps/${appName}`, 'fail', '앱 디렉토리 없음');
  }
}

// ========== 요약 & 출력 ==========

const summary = {
  total: checks.length,
  pass: checks.filter(c => c.status === 'pass').length,
  warn: checks.filter(c => c.status === 'warn').length,
  fail: checks.filter(c => c.status === 'fail').length,
};
const exitCode = summary.fail > 0 ? 1 : (summary.warn > 0 ? 2 : 0);

if (jsonMode) {
  console.log(JSON.stringify({ checks, summary, exitCode }, null, 2));
  process.exit(exitCode);
}

const C = {
  pass: '\x1b[32m✓\x1b[0m',
  warn: '\x1b[33m⚠\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
};

console.log('🔍 Barreleye Preflight\n');
const byCategory = {};
for (const c of checks) (byCategory[c.category] ||= []).push(c);
for (const [cat, items] of Object.entries(byCategory)) {
  console.log(`[${cat}]`);
  for (const c of items) {
    const line = `  ${C[c.status]} ${c.name}`;
    console.log(c.detail ? `${line}  —  ${C.dim(c.detail)}` : line);
  }
  console.log();
}

console.log('─'.repeat(50));
console.log(`✓ ${summary.pass}  ⚠ ${summary.warn}  ✗ ${summary.fail}`);

if (summary.fail > 0) {
  console.log('\n' + C.red('❌ 필수 체크 실패. 해결 후 재실행하세요.'));
} else if (summary.warn > 0) {
  console.log('\n' + C.yellow('⚠️  경고 있음. 일부 기능 영향 가능.'));
} else {
  console.log('\n' + C.green('✅ 모두 통과.'));
}

process.exit(exitCode);
