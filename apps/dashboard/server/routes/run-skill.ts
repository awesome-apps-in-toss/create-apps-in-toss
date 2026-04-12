import { Router } from 'express';
import { spawn, execSync } from 'child_process';
import path from 'path';

const router = Router();
const APPS_DIR = path.resolve(process.cwd(), '../');
const REPO_ROOT = path.resolve(process.cwd(), '../../');

const ALLOWED_SKILLS = ['ait-ut', 'idea-to-prd', 'icon-generator'] as const;
type Skill = (typeof ALLOWED_SKILLS)[number];

// icon-generator는 모노레포 루트에서 실행 (앱 컨텍스트를 인자로 넘김)
// 나머지는 앱 폴더에서 실행
function getCwd(skill: Skill, appName: string): string {
  if (skill === 'icon-generator') return REPO_ROOT;
  return path.join(APPS_DIR, appName);
}

function getClaudePath(): string {
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude';
  }
}

router.get('/stream', (req, res) => {
  const skill = req.query['skill'] as string;
  const appName = req.query['app'] as string;

  if (!skill || !appName) {
    res.status(400).json({ error: 'skill and app params required' });
    return;
  }

  if (!(ALLOWED_SKILLS as readonly string[]).includes(skill)) {
    res.status(400).json({ error: `Unknown skill. Allowed: ${ALLOWED_SKILLS.join(', ')}` });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendLog = (line: string) => res.write(`event: log\ndata: ${line.replace(/\n/g, ' ')}\n\n`);
  const sendDone = () => {
    res.write('event: done\ndata: ok\n\n');
    res.end();
  };

  const typedSkill = skill as Skill;
  const cwd = getCwd(typedSkill, appName);
  const claudePath = getClaudePath();

  sendLog(`[dashboard] /${skill} 실행 중 (앱: ${appName})`);
  sendLog(`[dashboard] cwd: ${cwd}`);

  const proc = spawn(claudePath, ['--dangerously-skip-permissions', '-p', `/${skill}`], {
    cwd,
    env: { ...process.env },
    shell: false,
  });

  proc.stdout.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .forEach((line) => {
        if (line.trim()) sendLog(line);
      });
  });
  proc.stderr.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .forEach((line) => {
        if (line.trim()) sendLog(`[stderr] ${line}`);
      });
  });
  proc.on('close', (code) => {
    sendLog(`[dashboard] 종료 (exit code: ${code ?? 0})`);
    sendDone();
  });
  proc.on('error', (err) => {
    sendLog(`[오류] ${err.message}`);
    sendDone();
  });
  req.on('close', () => {
    if (!proc.killed) proc.kill();
  });
});

export { router as runSkillRouter };
