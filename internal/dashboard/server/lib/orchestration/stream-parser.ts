// Claude CLI --output-format stream-json 파서.
// 한 줄의 JSON이 여러 파생 이벤트를 낼 수 있으므로 배열을 반환한다.
//
// 실제 CLI 출력 관찰 기준 (claude 2.1.x):
//   { type: 'system', subtype: 'init' | 'hook_started' | 'hook_response' }     → 무시
//   { type: 'assistant', message: { content: [...blocks] } }                   → 블록별로 분해
//   { type: 'user', message: { content: [{ type: 'tool_result', ... }] } }     → 기본 무시(잡음)
//   { type: 'result', subtype: 'success' | ... }                               → turn_end
//   { type: 'rate_limit_event' | ... }                                         → 무시
//
// assistant.content 의 각 block:
//   { type: 'text', text }                          → log
//   { type: 'thinking', ... }                       → 무시(UX 노이즈)
//   { type: 'tool_use', name, input, id }
//     - name === 'AskUserQuestion'                  → question (structured)
//     - name ∈ { Write, Edit, NotebookEdit }        → artifact
//     - 그 외                                        → log "[tool: name]"

export type ParsedEventKind = 'log' | 'artifact' | 'turn_end' | 'question';

export interface ParsedQuestion {
  /** 첫 번째 question 의 질문 본문. multi-question 은 아직 지원 안 함(있으면 첫 항목만). */
  text: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
  /** 여러 질문이 한 번에 왔을 때의 나머지 — 현재는 UI 에서 사용하지 않지만 로깅용. */
  extra?: Array<{ question: string; header?: string }>;
  toolUseId?: string;
}

export interface ParsedEvent {
  kind: ParsedEventKind;
  message?: string;
  artifact?: { path?: string; preview?: string };
  question?: ParsedQuestion;
  raw: unknown;
}

interface AssistantBlock {
  type?: string;
  text?: string;
  name?: string;
  id?: string;
  input?: {
    file_path?: string;
    path?: string;
    content?: string;
    questions?: Array<{
      question?: string;
      header?: string;
      multiSelect?: boolean;
      options?: Array<{ label?: string; description?: string }>;
    }>;
    [key: string]: unknown;
  };
}

interface ClaudeStreamMessage {
  type?: string;
  subtype?: string;
  message?: {
    role?: string;
    stop_reason?: string | null;
    content?: AssistantBlock[];
  };
}

function parseAskUserQuestion(block: AssistantBlock): ParsedQuestion | null {
  const questions = block.input?.questions;
  if (!Array.isArray(questions) || questions.length === 0) return null;
  const [first, ...rest] = questions;
  if (!first || typeof first.question !== 'string') return null;

  const options = Array.isArray(first.options)
    ? first.options
        .map((opt) => ({
          label: typeof opt.label === 'string' ? opt.label : '',
          description: typeof opt.description === 'string' ? opt.description : undefined,
        }))
        .filter((opt) => opt.label.length > 0)
    : undefined;

  const q: ParsedQuestion = {
    text: first.question,
    ...(typeof first.header === 'string' && { header: first.header }),
    ...(options && options.length > 0 && { options }),
    ...(typeof first.multiSelect === 'boolean' && { multiSelect: first.multiSelect }),
    ...(typeof block.id === 'string' && { toolUseId: block.id }),
  };
  if (rest.length > 0) {
    q.extra = rest
      .filter((r): r is { question: string; header?: string } => typeof r.question === 'string')
      .map((r) => ({
        question: r.question,
        ...(typeof r.header === 'string' && { header: r.header }),
      }));
  }
  return q;
}

function parseAssistantBlocks(blocks: AssistantBlock[]): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;

    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      events.push({ kind: 'log', message: block.text, raw: block });
      continue;
    }
    if (block.type === 'thinking') {
      continue;
    }
    if (block.type === 'tool_use') {
      if (block.name === 'AskUserQuestion') {
        const q = parseAskUserQuestion(block);
        if (q) {
          events.push({ kind: 'question', question: q, raw: block });
          continue;
        }
      }
      if (block.name === 'Write' || block.name === 'Edit' || block.name === 'NotebookEdit') {
        const p = block.input?.file_path ?? block.input?.path;
        if (typeof p === 'string') {
          events.push({ kind: 'artifact', artifact: { path: p }, raw: block });
          continue;
        }
      }
      // 그 외 도구는 사용자에게 짧게만 노출. (Read/Glob/Grep 같은 읽기 도구 소음 최소화)
      if (block.name && block.name !== 'Read' && block.name !== 'Glob' && block.name !== 'Grep') {
        events.push({ kind: 'log', message: `🔧 ${block.name}`, raw: block });
      }
    }
  }
  return events;
}

/** 자동 거부된 AskUserQuestion 의 tool_result 노이즈인지 판별. */
function isAskUserDenialResult(msg: ClaudeStreamMessage): boolean {
  const content = msg.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((b) => {
    const br = b as {
      type?: string;
      is_error?: boolean;
      content?: unknown;
    };
    if (br.type !== 'tool_result' || !br.is_error) return false;
    // CLI 가 주는 자동 거부 메시지는 "Answer questions?" (버전 따라 달라질 수 있음).
    return (
      br.content === 'Answer questions?' ||
      (typeof br.content === 'string' && /answer\s*questions?/i.test(br.content))
    );
  });
}

/**
 * 한 줄의 stream-json 을 파생 이벤트 배열로 변환.
 * 비 JSON 혹은 알 수 없는 type 은 raw log 로 폴백.
 */
export function parseStreamLine(line: string): ParsedEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let json: ClaudeStreamMessage;
  try {
    json = JSON.parse(trimmed) as ClaudeStreamMessage;
  } catch {
    return [{ kind: 'log', message: trimmed, raw: trimmed }];
  }

  // system/hook/rate_limit 계열은 UI 노이즈라 무시.
  if (json.type === 'system' || json.type === 'rate_limit_event') return [];

  if (json.type === 'result') {
    return [{ kind: 'turn_end', raw: json }];
  }

  if (json.type === 'assistant') {
    const blocks = json.message?.content;
    if (Array.isArray(blocks)) return parseAssistantBlocks(blocks);
    return [];
  }

  if (json.type === 'user') {
    // tool_result 가 들어있으면 대부분 내부 에코이므로 무시. 단, AskUserQuestion 자동거부는
    // 확실히 걸러낸다.
    if (isAskUserDenialResult(json)) return [];
    const content = json.message?.content;
    if (Array.isArray(content)) {
      const texts: string[] = [];
      for (const b of content) {
        const br = b as { type?: string; text?: string };
        if (br.type === 'text' && typeof br.text === 'string' && br.text.trim()) {
          texts.push(br.text);
        }
      }
      if (texts.length > 0) {
        return [{ kind: 'log', message: texts.join('\n'), raw: json }];
      }
    }
    return [];
  }

  // 알 수 없는 타입: 그대로 로그로 노출.
  return [{ kind: 'log', message: trimmed, raw: json }];
}
