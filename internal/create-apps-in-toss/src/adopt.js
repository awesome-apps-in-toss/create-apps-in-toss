import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = 'Awesome-Apps-in-Toss/create-apps-in-toss';
const UPSTREAM_URL = `https://github.com/${REPO}.git`;
const MANIFEST_FILE = '.barreleye-template.json';
const DEFAULT_BRANCH = process.env.BARRELEYE_TEMPLATE_BRANCH || 'main';

const c = {
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function printHelp() {
  console.log(`
${c.bold('create-apps-in-toss adopt')} — 기존 레포를 템플릿에 연결

${c.bold('사용법')}
  npx create-apps-in-toss adopt [options]

${c.bold('설명')}
  npx create-apps-in-toss로 생성하지 않은 기존 레포에
  upstream remote와 .barreleye-template.json을 추가해
  pnpm update-template을 쓸 수 있게 연결합니다.

${c.bold('옵션')}
  -b, --branch <name>   upstream 브랜치 (기본: main)
  --skip-remote         upstream remote 추가 스킵
  -h, --help            도움말

${c.bold('예시')}
  npx create-apps-in-toss adopt
  npx create-apps-in-toss adopt --branch develop
`);
}

function parseArgs(argv) {
  const args = { branch: DEFAULT_BRANCH, skipRemote: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--branch' || a === '-b') args.branch = argv[++i];
    else if (a === '--skip-remote') args.skipRemote = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function git(argv, cwd = process.cwd()) {
  const r = spawnSync('git', argv, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function isGitRepo() {
  return git(['rev-parse', '--git-dir']).ok;
}

function manifestExists() {
  return fs.existsSync(path.resolve(process.cwd(), MANIFEST_FILE));
}

function isMonorepo() {
  return fs.existsSync(path.resolve(process.cwd(), 'pnpm-workspace.yaml'));
}

function resolveUpstreamRemote(branch, skip) {
  const existing = git(['remote', 'get-url', 'upstream']);
  if (existing.ok) {
    if (!existing.out.includes('Awesome-Apps-in-Toss/create-apps-in-toss')) {
      console.error(`[adopt] ❌ 'upstream' remote가 이미 다른 URL로 등록되어 있습니다: ${existing.out}`);
      console.error(`   충돌 시 --skip-remote 옵션으로 remote 추가를 건너뛸 수 있습니다.`);
      process.exit(1);
    }
    console.log(c.gray(`  · upstream remote 이미 존재 (${existing.out})`));
    return 'upstream';
  }

  if (skip) {
    console.log(c.yellow('  ⚠ --skip-remote: upstream remote 추가 스킵'));
    return null;
  }

  console.log(c.gray(`  · upstream remote 등록 → ${UPSTREAM_URL}`));
  const add = git(['remote', 'add', 'upstream', UPSTREAM_URL]);
  if (!add.ok) {
    throw new Error(`upstream remote 추가 실패: ${add.err}`);
  }
  return 'upstream';
}

function fetchLatestSha(remote, branch) {
  console.log(c.gray(`  · ${remote}/${branch} fetch 중...`));
  const fetched = spawnSync('git', ['fetch', '--depth=1', remote, branch], {
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: false,
  });
  if (fetched.status !== 0) {
    throw new Error(
      `git fetch 실패 (${remote}/${branch})\n` +
        (fetched.stderr?.toString().trim() || '네트워크 오류')
    );
  }
  const sha = git(['rev-parse', 'FETCH_HEAD']);
  if (!sha.ok || !sha.out) throw new Error('upstream SHA 조회 실패');
  return sha.out;
}

function writeManifest(sha, branch) {
  const manifest = {
    repository: REPO,
    branch,
    sha,
    adoptedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.resolve(process.cwd(), MANIFEST_FILE),
    JSON.stringify(manifest, null, 2) + '\n'
  );
}

function printNext(sha) {
  console.log('\n' + c.green('✅ 연결 완료!'));
  console.log(c.gray(`   upstream SHA: ${sha.slice(0, 7)}`));
  console.log(c.bold('\n다음 단계:'));
  console.log(c.gray('  $ ') + 'pnpm update-template   ' + c.gray('# 템플릿 파일 동기화'));
  console.log(
    '\n' +
      c.gray('update-template은 scripts/, packages/, internal/dashboard 등') +
      '\n' +
      c.gray('템플릿 관리 파일만 동기화하며, apps/*는 건드리지 않습니다.')
  );
}

export async function adopt(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }

  console.log(c.bold(c.cyan('\n🔗 create-apps-in-toss adopt')));

  if (!isGitRepo()) {
    throw new Error('git 레포지토리가 아닙니다. git init 후 재실행하세요.');
  }

  if (!isMonorepo()) {
    console.log(
      c.yellow('  ⚠ pnpm-workspace.yaml을 찾을 수 없습니다. pnpm 모노레포가 맞는지 확인하세요.')
    );
  }

  if (manifestExists()) {
    console.log(c.yellow(`  ⚠ ${MANIFEST_FILE}가 이미 존재합니다.`));
    const existing = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), MANIFEST_FILE), 'utf8')
    );
    console.log(c.gray(`   현재 SHA: ${existing.sha?.slice(0, 7) ?? '(없음)'}`));
    console.log(c.gray('   업데이트가 필요하면: pnpm update-template'));
    return;
  }

  const remote = resolveUpstreamRemote(args.branch, args.skipRemote);

  let sha;
  if (remote) {
    sha = fetchLatestSha(remote, args.branch);
    console.log(c.gray(`  · upstream HEAD: ${sha.slice(0, 7)}`));
  } else {
    // --skip-remote: manifest에 sha 없이 작성, update-template이 merge-base로 추정
    sha = '';
    console.log(
      c.yellow(
        '  ⚠ remote 없이 연결 — pnpm update-template 실행 전 upstream remote를 수동 등록하세요:'
      )
    );
    console.log(c.gray(`     git remote add upstream ${UPSTREAM_URL}`));
  }

  console.log(c.gray(`  · ${MANIFEST_FILE} 생성 중...`));
  writeManifest(sha, args.branch);

  printNext(sha || '(unknown)');
}
