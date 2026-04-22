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
 * 대시보드 세션 프레이밍 노트. Claude 가 AskUserQuestion 의 CLI 자동 거부를
 * "사용자 취소" 로 오해하는 걸 막기 위한 시스템 프롬프트 append.
 *
 * stream-json 모드에서 `AskUserQuestion` 툴 호출은 CLI 가 즉시 `Answer questions?`
 * 에러로 닫아버리지만, 대시보드는 그 질문을 사용자에게 전달하고 실제 답변을
 * 다음 user 메시지로 전송한다. 이 사실을 모르면 Claude 가 "질문이 취소됐다"
 * 같은 반응을 내거나 같은 질문을 반복한다.
 */
const DASHBOARD_SYSTEM_NOTE = [
  '⚙️ Dashboard session contract',
  '',
  '이 세션은 대시보드(React UI) 안에서 돌고 있고, AskUserQuestion 은 그 UI 로 라우팅된다.',
  '',
  'CLI 관측 동작:',
  '- AskUserQuestion 을 호출하면 즉시 `{ type: "tool_result", is_error: true, content: "Answer questions?" }` 가 반환된다.',
  '- 이건 stream-json 모드의 transport artifact 일 뿐이며, 사용자 취소/거부 신호가 아니다.',
  '- 대시보드는 질문을 사용자에게 보여주고, 실제 답변은 다음 user 메시지로 전달한다.',
  '',
  '따라서 반드시 지켜야 할 것:',
  '1. "Answer questions?" tool_result 를 "질문이 취소됐다"/"사용자가 거부했다" 로 해석하지 말 것.',
  '2. 사과하거나 "질문이 취소됐네요" 같은 문구를 출력하지 말 것.',
  '3. 같은 AskUserQuestion 을 재호출해서 재질문하지 말 것. 답변이 모호하면 자유 텍스트로 한 번만 되묻는다.',
  '4. 다음 user 메시지를 방금 던진 질문의 답변으로 그대로 받아들여서 진행할 것.',
].join('\n');

/**
 * Claude CLI 를 양방향 stream-json 모드로 spawn.
 *
 * 약관/보안: --dangerously-skip-permissions 절대 사용 금지.
 * --permission-mode acceptEdits 로 편집만 자동 허용 (Bash/네트워크는 여전히 확인).
 *
 * --input-format stream-json 을 쓰면 `-p "prompt"` 인자는 **무시되고** 모든 입력은 stdin 으로 들어온다.
 * 따라서 초기 프롬프트도 `encodeUserInput()` 으로 stdin 에 써야 한다.
 * (이 함수는 spawn 만 담당하며 실제 initial 메시지 주입은 RunSession 이 처리.)
 *
 * --include-partial-messages 로 content_block_delta 이벤트를 받아 라이브 스트리밍 렌더링을 지원한다.
 * --append-system-prompt 로 AskUserQuestion 자동 거부에 대한 프레이밍 노트를 주입한다.
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
    '--include-partial-messages',
    '--append-system-prompt',
    DASHBOARD_SYSTEM_NOTE,
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
