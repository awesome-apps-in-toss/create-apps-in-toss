import { spawn, execSync } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

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

/**
 * cwd 에서 상향 탐색하여 git 루트(.git 디렉토리를 포함하는 최초 조상) 경로를 찾는다.
 * cwd 가 `apps/<name>` 처럼 repo 하위로 들어가 있을 때, 스킬이 상위 경로
 * (`docs/launch-flow/...` 등) Read 권한을 CLI 에 거부당하지 않도록 `--add-dir` 로
 * 세션에 붙여주기 위한 용도. 찾지 못하면 null.
 */
function findGitRoot(start: string): string | null {
  let dir = path.resolve(start);
  while (true) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface SpawnClaudeOptions {
  cwd: string;
  /** 스킬의 실행 모드. automated 는 stdin 이 즉시 닫혀 사용자 응답을 받을 수 없으므로
   *  시스템 프롬프트에서 질문 금지 + 강제 완료 계약을 심어야 한다. */
  mode: 'interactive' | 'automated';
}

/**
 * 대시보드 세션 프레이밍 노트 빌더.
 *
 * interactive 모드: AskUserQuestion 의 CLI 자동 거부("Answer questions?") 를 "사용자 취소" 로
 * 오해하지 않게 라우팅 계약을 설명. 대시보드가 질문을 UI 로 포워딩하고 답변은 다음 user
 * 메시지로 들어온다.
 *
 * automated 모드: stdin 이 초기 프롬프트 직후 닫힌다(run-session.ts 참고). AskUserQuestion 호출도,
 * "어느 방향으로 갈까요?" 같은 질문형 텍스트로 턴을 끝내는 것도 응답이 돌아올 수 없어
 * 태스크가 중단된다. 따라서 "질문 금지 · 합리적 기본값을 스스로 골라 끝까지 완료 · 결정의
 * 근거와 대안은 최종 요약에 한 줄로 남겨 사용자가 사후에 바꿀 수 있게 하라" 는 계약을 심는다.
 *
 * 주의: 이 문자열은 CLI argv 로 들어가며, Windows 에서 `shell: true` 로 spawn 할 때
 * cmd.exe 가 LF 를 만나면 명령을 조기 종료시켜 뒤 인자(`--verbose` 등)를 잃는다.
 * 따라서 반드시 single-line 으로 유지할 것 (join(' ') 평탄화).
 */
function buildDashboardSystemNote(mode: 'interactive' | 'automated'): string {
  const parts: string[] = ['[Dashboard session contract] 이 세션은 대시보드(React UI) 안에서 돌고 있다.'];

  if (mode === 'interactive') {
    parts.push(
      '[Interactive mode] AskUserQuestion 은 그 UI 로 라우팅된다. CLI 관측 동작: AskUserQuestion 을 호출하면 즉시 `{ type: "tool_result", is_error: true, content: "Answer questions?" }` 가 반환되지만, 이건 stream-json 모드의 transport artifact 일 뿐 사용자 취소/거부 신호가 아니다. 대시보드는 질문을 사용자에게 보여주고 실제 답변은 다음 user 메시지로 전달한다.',
      '반드시 지켜야 할 것: (1) "Answer questions?" tool_result 를 "질문이 취소됐다"/"사용자가 거부했다" 로 해석하지 말 것. (2) 사과하거나 "질문이 취소됐네요" 같은 문구를 출력하지 말 것. (3) 같은 AskUserQuestion 을 재호출해서 재질문하지 말 것 — 답변이 모호하면 자유 텍스트로 한 번만 되묻는다. (4) 다음 user 메시지를 방금 던진 질문의 답변으로 그대로 받아들여서 진행할 것.',
    );
  } else {
    parts.push(
      '[Automated mode] 이 세션은 stdin 이 초기 프롬프트 직후 닫혀있어 추가 user 메시지를 절대 받을 수 없다. 즉 사용자에게 되묻는 모든 형태(AskUserQuestion 호출, "어느 방향으로 갈까요?"/"A 와 B 중 골라주세요" 같은 질문형 텍스트로 턴을 종료)는 응답이 오지 않아 태스크가 중단된다.',
      '반드시 지켜야 할 것: (1) AskUserQuestion 을 호출하지 말 것 — 호출해도 답이 오지 않는다. (2) 질문으로 턴을 끝내지 말 것 — 불확실하더라도 가장 합리적인 기본값을 스스로 골라 산출물을 끝까지 만들어낸다. (3) 결정의 근거·대안은 최종 요약에 "선택: X (이유: ..., 대안: Y)" 한두 줄로 남겨 사용자가 사후에 바꿀 수 있게 한다. (4) 입력이 모호하거나 정보가 모자라도 산출물의 형태(스킬 frontmatter 의 produces)를 먼저 만들고, 보완이 필요한 부분은 TODO 주석이나 요약 내 언급으로 남긴다 — 중간에 멈추지 말 것. (5) 정말로 산출물을 만들 수 없는 환경(권한/의존성 등)일 때만 이유를 명시한 실패 메시지로 종료한다.',
    );
  }

  parts.push(
    '[Termination contract] 이 세션은 한 번의 산출물(스킬 frontmatter 의 produces)을 만들어내면 끝나는 단발성 태스크다. 산출물을 저장한 뒤에는 다음 규칙을 지킨다: (a) 어떤 파일이 어디에 저장됐는지 한두 줄로 요약만 출력. (b) "추가로 뭐 해드릴까요?" 같은 추가 질문 금지. (c) 다음 단계로 **어떤 슬래시 커맨드도** 권유하지 말 것 — `/ait-*`, `/<other-skill>`, "Phase C 로 이어서" 같은 존재하지 않는 단계 조어 모두 금지. 대시보드가 파이프라인 카드로 다음 단계를 자동 안내한다. 남은 작업을 언급할 때도 "dev 서버에서 확인해 보세요" 처럼 일반 문장으로만 쓰고, 특정 스킬 이름이나 "Phase/Step N" 레이블을 불러내지 말 것. (d) 요약 출력 후 사용자 입력을 기다리지 말고 턴을 끝낼 것. 사용자가 추가 수정 요청을 보내면 그때 다시 돌아와서 반영하면 된다.',
    '[Metadata contract] 산출물은 관례 경로에 파일로 저장만 하면 대시보드 서버가 자동 감지·반영한다 — 로고/썸네일/스크린샷은 `apps/<app>/assets/*`, PRD 는 `apps/<app>/docs/prd/*.md` 또는 `docs/PRD.md`, UT 리포트는 `apps/<app>/docs/user-test/*.md`, 스캐폴딩은 `granite.config.ts`, 빌드는 `.ait`. 스킬은 `.meta-dashboard.json` 을 직접 수정하지 말 것 — 이 파일은 대시보드가 SSOT 로 관리하며 스킬이 쓰면 경합한다. 예외: `ait-meta` 만 초기 생성이 허용된다.',
  );

  return parts.join(' ');
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
    buildDashboardSystemNote(opts.mode),
    '--verbose',
  ];

  // cwd 가 git 루트의 하위(예: apps/<name>) 일 때, 상위 경로(docs/, .claude/ 등)
  // Read 를 CLI 가 자동 거부하지 않도록 git 루트를 세션 scope 에 추가한다.
  // cwd 가 이미 루트면 중복이라 건너뛴다.
  const gitRoot = findGitRoot(opts.cwd);
  if (gitRoot && path.resolve(gitRoot) !== path.resolve(opts.cwd)) {
    args.push('--add-dir', gitRoot);
  }

  // Windows: claude 바이너리가 .exe 면 CreateProcess 로 직접 spawn 한다 (shell: false).
  // cmd.exe (shell: true) 를 거치면 argv 가 한 줄로 합쳐지면서 시스템 프롬프트 안의
  // `<other-skill>`, `&`, `|` 같은 문자가 cmd 메타캐릭터(리다이렉션/파이프)로 해석돼
  // "The system cannot find the file specified." 로 즉시 실패한다.
  // .cmd/.bat 설치(npm 글로벌 등)만 shell 래핑이 필요하므로 확장자로 분기.
  const useShell =
    process.platform === 'win32' && /\.(cmd|bat)$/i.test(claudePath);

  return spawn(claudePath, args, {
    cwd: opts.cwd,
    env: { ...process.env },
    shell: useShell,
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
