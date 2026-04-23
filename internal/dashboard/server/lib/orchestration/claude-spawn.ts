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
 * 대시보드 세션 프레이밍 노트 빌더. `--append-system-prompt` 로 주입돼 매 턴마다 읽히므로
 * 반드시 single-line, 최소 분량으로 유지. (Windows `shell: true` 에서 cmd.exe 가 LF 를 만나면
 * 뒤 argv 를 잃으므로 줄바꿈 금지.)
 */
function buildDashboardSystemNote(mode: 'interactive' | 'automated'): string {
  const parts: string[] = ['[Dashboard session] React UI 안에서 실행되는 단발성 스킬 세션.'];

  if (mode === 'interactive') {
    parts.push(
      '[Interactive] AskUserQuestion 은 UI 로 라우팅된다. 호출 직후 돌아오는 `tool_result: "Answer questions?"` 는 stream-json transport artifact 일 뿐 취소/거부 신호가 아니다 — 사과·재호출·"질문이 취소됐네요" 금지. 다음 user 메시지가 그 답변이니 그대로 받아 진행한다. 답이 모호하면 자유 텍스트로 한 번만 되묻는다.',
    );
  } else {
    parts.push(
      '[Automated] stdin 이 초기 프롬프트 직후 닫혀있어 추가 user 메시지를 받을 수 없다. AskUserQuestion 호출·질문형 턴 종료 금지 — 불확실하면 합리적 기본값을 스스로 골라 산출물(frontmatter 의 produces)을 끝까지 만들고, 선택 근거·대안은 최종 요약에 "선택: X (이유, 대안)" 한 줄로 남긴다. 정보가 모자라도 멈추지 말고 TODO 로 표시. 권한·의존성 등 환경적 불능일 때만 이유 명시하고 실패 종료.',
    );
  }

  parts.push(
    '[Termination] 산출물 저장 후엔 파일 경로 한두 줄 요약만 출력하고 턴을 끝낸다. 추가 질문·사과/추임새·다음 단계 슬래시 커맨드 권유(`/ait-*`, `/<skill>`, "Phase/Step N" 조어 포함) 금지 — 다음 단계는 대시보드가 안내한다. 남은 작업은 "dev 서버에서 확인해 보세요" 같은 일반 문장으로만.',
    '[Metadata] 산출물을 관례 경로에 저장만 하면 서버가 자동 감지한다 — 에셋 `apps/<app>/assets/*`, PRD `apps/<app>/docs/prd/*.md` 또는 `docs/PRD.md`, UT 리포트 `apps/<app>/docs/user-test/*.md`, 스캐폴딩 `granite.config.ts`, 빌드 `.ait`. `.meta-dashboard.json` 은 대시보드 SSOT 이므로 직접 편집 금지 (ait-meta 초기 생성만 예외).',
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
