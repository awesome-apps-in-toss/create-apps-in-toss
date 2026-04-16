import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { downloadTemplate } from 'giget';
import prompts from 'prompts';

const REPO = 'Awesome-Apps-in-Toss/create-apps-in-toss';
const DEFAULT_BRANCH = process.env.BARRELEYE_TEMPLATE_BRANCH || 'main';
const UPSTREAM_URL = `https://github.com/${REPO}.git`;

const pkg = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
);
const SCAFFOLDER_ID = `${pkg.name}@${pkg.version}`;

const c = {
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function parseArgs(argv) {
  const args = { positional: [], branch: DEFAULT_BRANCH, skipInstall: false, skipGit: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--branch' || a === '-b') args.branch = argv[++i];
    else if (a === '--skip-install') args.skipInstall = true;
    else if (a === '--skip-git') args.skipGit = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-')) args.positional.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`
${c.bold('create-apps-in-toss')} — apps-in-toss 미니앱 모노레포 템플릿 스캐폴더

${c.bold('사용법')}
  npx create-apps-in-toss [project-dir] [options]

${c.bold('옵션')}
  -b, --branch <name>   fetch할 upstream 브랜치 (기본: main)
  --skip-install        의존성 설치 스킵
  --skip-git            git init 스킵
  -h, --help            도움말

${c.bold('예시')}
  npx create-apps-in-toss my-miniapp
  npx create-apps-in-toss my-miniapp --skip-install

${c.bold('환경변수')}
  GITHUB_TOKEN   GitHub API rate limit 5000/hr로 확장 (선택)
`);
}

async function resolveSha(repo, ref) {
  const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'create-apps-in-toss' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset');
      const resetAt = reset ? ` (복구: ${new Date(Number(reset) * 1000).toLocaleTimeString()})` : '';
      throw new Error(
        `GitHub API rate limit 도달 ${res.status}${resetAt}. ` +
          `GITHUB_TOKEN 환경변수를 설정하면 5000/hr로 늘어납니다 (e.g. export GITHUB_TOKEN=$(gh auth token)).`
      );
    }
    throw new Error(`GitHub API ${res.status}: ${ref} SHA 조회 실패.`);
  }
  const data = await res.json();
  if (!data.sha) throw new Error(`${ref} 브랜치에서 SHA를 찾지 못했습니다.`);
  return data.sha;
}

function isEmptyDir(p) {
  try {
    return fs.readdirSync(p).length === 0;
  } catch {
    return true;
  }
}

function toPackageName(raw) {
  const sanitized = raw
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 214);
  if (!sanitized) {
    console.log(
      c.yellow(
        `  ⚠ "${raw}"은(는) npm 패키지명으로 쓸 수 없어 package.json name을 "my-miniapp"으로 설정합니다. 필요하면 직접 수정하세요.`
      )
    );
    return 'my-miniapp';
  }
  return sanitized;
}

function pruneTemplate(target) {
  // 템플릿 샘플 앱 제거 — 사용자 프로젝트는 빈 apps/에서 시작
  const appsDir = path.join(target, 'apps');
  if (fs.existsSync(appsDir)) {
    for (const entry of fs.readdirSync(appsDir)) {
      fs.rmSync(path.join(appsDir, entry), { recursive: true, force: true });
    }
  }
  // 스캐폴더 패키지 제거 — scaffold된 사용자는 필요 없음
  fs.rmSync(path.join(target, 'internal', 'create-apps-in-toss'), {
    recursive: true,
    force: true,
  });
  // 빌드/스캐폴드 산출물 제거
  for (const rel of ['node_modules', '.git', 'pnpm-lock.yaml']) {
    fs.rmSync(path.join(target, rel), { recursive: true, force: true });
  }
}

function rewriteRootPackageJson(target, projectName) {
  const pkgPath = path.join(target, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.name = projectName;
  pkg.version = '0.0.0';
  delete pkg.description;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function writeTemplateManifest(target, { sha, branch }) {
  const manifest = {
    repository: REPO,
    branch,
    sha,
    scaffoldedAt: new Date().toISOString(),
    scaffolder: SCAFFOLDER_ID,
  };
  fs.writeFileSync(
    path.join(target, '.barreleye-template.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
}

function hasCmd(cmd) {
  // Windows에서는 where/which를 shell로 실행해야 PATHEXT가 해석되어 git.exe를 찾음
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], { stdio: 'ignore', shell: true });
  return r.status === 0;
}

function run_(cmd, args, cwd) {
  // pnpm은 .cmd shim이라 Windows에서 shell:true 필요
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0;
}

function initGit(target, sha) {
  if (!hasCmd('git')) {
    console.log(c.yellow('  ⚠ git이 설치되어 있지 않아 git init 스킵'));
    return false;
  }
  // git.exe는 shell 없이 직접 실행 (공백 인자 깨짐 방지)
  const git = (args) =>
    spawnSync('git', args, { cwd: target, stdio: ['ignore', 'ignore', 'pipe'], shell: false });
  if (git(['init', '-b', 'main']).status !== 0) git(['init']);
  git(['add', '-A']);
  const commit = git([
    'commit',
    '--no-verify',
    '-m',
    `chore: scaffold from ${SCAFFOLDER_ID} @${sha.slice(0, 7)}`,
  ]);
  if (commit.status !== 0) {
    const err = commit.stderr?.toString().trim() || 'unknown';
    console.log(c.yellow(`  ⚠ git commit 실패 (${err.split('\n')[0]}) — 수동으로 커밋하세요`));
  }
  git(['remote', 'add', 'upstream', UPSTREAM_URL]);
  return true;
}

function printNext(projectDir, installed) {
  console.log('\n' + c.green('✅ 완료!'));
  console.log(c.bold('\n다음 단계:'));
  console.log(c.gray('  $ ') + `cd ${projectDir}`);
  if (!installed) console.log(c.gray('  $ ') + 'pnpm install');
  console.log(c.gray('  $ ') + 'pnpm new-app my-first-app   ' + c.gray('# 첫 미니앱 생성'));
  console.log(c.gray('  $ ') + 'pnpm dev                     ' + c.gray('# 대시보드 실행'));
  console.log('\n' + c.gray('템플릿 업데이트:') + ' pnpm update-template');
  console.log(c.gray('문서:') + ' https://github.com/' + REPO);
}

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }

  console.log(c.bold(c.cyan('\n🍞 create-apps-in-toss')));

  let projectDir = args.positional[0];
  if (!projectDir) {
    const res = await prompts({
      type: 'text',
      name: 'dir',
      message: '프로젝트 디렉토리 이름',
      initial: 'my-miniapp',
      validate: (v) => (v && v.trim() ? true : '이름을 입력하세요'),
    });
    projectDir = res.dir;
    if (!projectDir) process.exit(1);
  }

  const target = path.resolve(process.cwd(), projectDir);
  const targetExistedBefore = fs.existsSync(target);
  if (targetExistedBefore && !isEmptyDir(target)) {
    throw new Error(`${target} 이 비어있지 않습니다. 빈 디렉토리를 지정하거나 삭제 후 재시도하세요.`);
  }

  console.log(c.gray(`  · SHA 조회 (${args.branch})...`));
  const sha = await resolveSha(REPO, args.branch);
  console.log(c.gray(`  · ${sha.slice(0, 7)} 다운로드 중...`));

  const cleanupOnFailure = () => {
    if (!targetExistedBefore) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  };

  let installed = false;
  try {
    await downloadTemplate(`github:${REPO}#${sha}`, {
      dir: target,
      force: true,
      registry: false,
      auth: process.env.GITHUB_TOKEN,
    });

    console.log(c.gray('  · 템플릿 정리 (샘플 앱·스캐폴더·lockfile 제거)...'));
    pruneTemplate(target);

    const projectName = toPackageName(path.basename(target));
    rewriteRootPackageJson(target, projectName);
    writeTemplateManifest(target, { sha, branch: args.branch });

    if (!args.skipGit) {
      console.log(c.gray('  · git init + upstream remote 등록...'));
      initGit(target, sha);
    }

    if (!args.skipInstall) {
      if (hasCmd('pnpm')) {
        console.log(c.gray('  · pnpm install 실행...'));
        installed = run_('pnpm', ['install'], target);
        if (!installed) console.log(c.yellow('  ⚠ pnpm install 실패 — 수동으로 재시도하세요'));
      } else {
        console.log(c.yellow('  ⚠ pnpm이 설치되어 있지 않아 install 스킵 (npm i -g pnpm)'));
      }
    }
  } catch (err) {
    cleanupOnFailure();
    throw err;
  }

  printNext(projectDir, installed);
}
