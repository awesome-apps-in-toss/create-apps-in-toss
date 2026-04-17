import { spawn, execSync } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';

export function findClaudeExecutable(): string {
  const probe = process.platform === 'win32' ? 'where claude' : 'which claude';
  try {
    const out = execSync(probe, { encoding: 'utf-8' }).split(/\r?\n/)[0]?.trim();
    if (out) return out;
  } catch {
    // fallthrough
  }
  return 'claude';
}

export interface SpawnClaudeOptions {
  skill: string;
  cwd: string;
  initialPrompt: string;
}

/**
 * Spawn Claude CLI with stream-json I/O and acceptEdits permission mode.
 *
 * 약관/보안: --dangerously-skip-permissions 절대 사용 금지.
 * --permission-mode acceptEdits 고정 → 파일 편집은 자동 허용, Bash/네트워크는 여전히 확인.
 *
 * NOTE: stream-json input schema는 claude CLI 버전마다 다를 수 있음.
 * 현재 가정: `{ "type": "user", "message": { "role": "user", "content": [{ "type": "text", "text": "..." }] } }`
 * 필요 시 사용자 입력은 sendUserInput() 헬퍼로 직렬화한다.
 */
export function spawnClaudeForSkill(opts: SpawnClaudeOptions): ChildProcessWithoutNullStreams {
  const claudePath = findClaudeExecutable();
  const args = [
    '--permission-mode',
    'acceptEdits',
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--verbose',
    '-p',
    `/${opts.skill} ${opts.initialPrompt}`.trim(),
  ];
  return spawn(claudePath, args, {
    cwd: opts.cwd,
    env: { ...process.env },
    shell: process.platform === 'win32',
  });
}

/** Serialize a user reply as a stream-json input line. */
export function encodeUserInput(text: string): string {
  const payload = {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
  };
  return JSON.stringify(payload) + '\n';
}
