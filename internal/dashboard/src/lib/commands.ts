// ──────────────────────────────────────────────────────────────
// 단계별 실행 명령 빌더
//
// 대시보드는 더 이상 스킬을 직접 실행하지 않는다 (오케스트레이션 계층 제거).
// 대신 각 단계를 터미널에서 Claude Code / Codex 로 실행할 수 있도록
// "복사용 명령어" 만 만들어 보여준다.
//
// 전제: 두 명령 모두 해당 **앱 폴더(apps/<name>)** 에서 실행하며, 모두 **대화형** 세션이다.
//   - Claude: 프로젝트 스킬이 자동 인식되므로 `/ait-xxx` 슬래시 커맨드를 첫 입력으로 넘겨 대화형 진입.
//             (`-p`/`--print` 는 headless 1-shot 이라 질문을 주고받는 ait-* 스킬에는 부적합)
//   - Codex:  슬래시 스킬 개념이 없으므로 동일 지침이 담긴 SKILL.md 를 따르게 한다.
//             (앱 폴더 기준 `../../.claude/skills/<skill>/SKILL.md` 로 레포 루트의 스킬을 가리킴)
//
// 정확한 명령 포맷을 바꾸고 싶으면 이 파일 한 곳만 고치면 된다.
// ──────────────────────────────────────────────────────────────

export type CommandTool = 'claude' | 'codex';

export interface LaunchCommand {
  tool: CommandTool;
  /** UI 라벨 (예: "Claude Code") */
  label: string;
  /** 클립보드에 복사될 실제 명령 문자열 */
  command: string;
}

const TOOL_LABEL: Record<CommandTool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

/** 스킬 id 로 claude / codex 실행 명령을 만든다. (앱 폴더에서 실행 전제) */
export function buildLaunchCommands(skill: string): LaunchCommand[] {
  return [
    {
      tool: 'claude',
      label: TOOL_LABEL.claude,
      command: `claude "/${skill}"`,
    },
    {
      tool: 'codex',
      label: TOOL_LABEL.codex,
      command: `codex "../../.claude/skills/${skill}/SKILL.md 가이드대로 진행해줘"`,
    },
  ];
}
