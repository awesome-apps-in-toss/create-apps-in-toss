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
  cwd: string;
}

/**
 * Claude CLI 를 양방향 stream-json 모드로 spawn.
 *
 * 약관/보안: --dangerously-skip-permissions 절대 사용 금지.
 * --permission-mode acceptEdits 로 편집만 자동 허용 (Bash/네트워크는 여전히 확인).
 *
 * --input-format stream-json 을 쓰면 `-p "prompt"` 인자는 **무시되고** 모든 입력은 stdin 으로 들어온다.
 * 따라서 초기 프롬프트도 `encodeUserInput()` 으로 stdin 에 써야 한다.
 * (이 함수는 spawn 만 담당하며 실제 initial 메시지 주입은 RunSession 이 처리.)
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

/** 스킬을 실행하기 위한 최초 user 메시지 (`/<skill> <initialPrompt>`). */
export function buildInitialPrompt(skill: string, initialPrompt: string): string {
  const trimmed = initialPrompt.trim();
  return trimmed ? `/${skill} ${trimmed}` : `/${skill}`;
}
