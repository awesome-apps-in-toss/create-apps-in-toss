// Claude CLI --output-format stream-json 파서.
// 한 줄의 JSON이 여러 파생 이벤트를 낼 수 있으므로 배열을 반환한다.
//
// 실제 CLI 출력 관찰 기준 (claude 2.1.x, --include-partial-messages 활성):
//   { type: 'system', subtype: 'init' | 'hook_started' | 'hook_response' | 'status' } → 무시
//   { type: 'stream_event', event: { type: 'message_start' | 'message_delta' | 'message_stop' } } → 무시
//   { type: 'stream_event', event: { type: 'content_block_start', index, content_block } } → text 는 text_start, 그 외 무시
//   { type: 'stream_event', event: { type: 'content_block_delta', index, delta } } → text_delta 는 실시간 스트림
//   { type: 'stream_event', event: { type: 'content_block_stop', index } } → text_stop
//   { type: 'assistant', message: { content: [...blocks] } } → 블록별로 분해. text 블록은 이미 delta 로 흘렀으므로 스킵.
//   { type: 'user', message: { content: [{ type: 'tool_result', ... }] } } → 기본 무시
//   { type: 'result', subtype: 'success' | ... } → turn_end
//   { type: 'rate_limit_event' | ... } → 무시
//
// assistant.content 의 각 block:
//   { type: 'text', text } → 이미 delta 로 스트림 완료 → 스킵
//   { type: 'thinking', ... } → 무시 (UX 노이즈)
//   { type: 'tool_use', name, input, id }
//     - name === 'AskUserQuestion' → question (structured)
//     - name ∈ { Write, Edit, NotebookEdit } → artifact
//     - 그 외 → log "🔧 name[: 요약]"

export type ParsedEventKind =
  | 'log'
  | 'artifact'
  | 'turn_end'
  | 'question'
  | 'text_start'
  | 'text_delta'
  | 'text_stop';

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
  /** text_delta 의 증분 텍스트. */
  deltaText?: string;
  /** stream_event 에서 온 content block 인덱스. text_start 로 열린 블록의
   *  stop 을 구분해 비-text 블록(tool_use 등)의 content_block_stop 을 걸러내는 데 쓴다. */
  blockIndex?: number;
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
    command?: string;
    description?: string;
    pattern?: string;
    url?: string;
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
  session_id?: string;
  message?: {
    role?: string;
    id?: string;
    stop_reason?: string | null;
    content?: AssistantBlock[];
  };
  event?: {
    type?: string;
    index?: number;
    content_block?: { type?: string; text?: string; name?: string; id?: string };
    delta?: { type?: string; text?: string; partial_json?: string };
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

/** Bash/Grep/Glob 등 도구의 주요 인자를 짧게 요약한다. UX 용. */
function summarizeToolInput(name: string, input: AssistantBlock['input']): string | null {
  if (!input) return null;
  switch (name) {
    case 'Bash':
    case 'PowerShell': {
      const cmd = typeof input.command === 'string' ? input.command : null;
      if (!cmd) return null;
      return cmd.length > 80 ? cmd.slice(0, 77) + '…' : cmd;
    }
    case 'Grep':
    case 'Glob': {
      const pat = typeof input.pattern === 'string' ? input.pattern : null;
      if (!pat) return null;
      return pat;
    }
    case 'Read': {
      const p = typeof input.file_path === 'string' ? input.file_path : null;
      return p;
    }
    case 'WebFetch':
    case 'WebSearch': {
      const url = typeof input.url === 'string' ? input.url : null;
      return url;
    }
    default:
      return null;
  }
}

function parseAssistantBlocks(blocks: AssistantBlock[]): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;

    // text 블록: partial-messages 모드에서 이미 content_block_delta 로 스트림됨.
    // 최종 assistant 메시지의 text 블록은 중복이므로 스킵.
    if (block.type === 'text') continue;
    if (block.type === 'thinking') continue;

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
      // Read/Glob/Grep 같은 읽기 도구는 노이즈가 많아 제외. 나머지는 짧게 요약 노출.
      if (block.name && block.name !== 'Read' && block.name !== 'Glob' && block.name !== 'Grep') {
        const summary = summarizeToolInput(block.name, block.input);
        const message = summary ? `🔧 ${block.name}: ${summary}` : `🔧 ${block.name}`;
        events.push({ kind: 'log', message, raw: block });
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
 * `stream_event` 는 --include-partial-messages 활성 시 CLI 가 내보내는 Anthropic 원본 SSE 이벤트.
 * 여기서는 text content_block 만 증분 이벤트로 변환한다. content_block_stop 은 text 블록이든
 * tool_use 블록이든 붙으므로 blockIndex 를 함께 실어 소비자(run-session)가 활성 text 블록의
 * stop 만 받아들이게 한다. tool_use 의 input_json_delta 등은 최종 `assistant` 메시지에서
 * 파싱하므로 무시한다.
 */
function parseStreamEvent(msg: ClaudeStreamMessage): ParsedEvent[] {
  const ev = msg.event;
  if (!ev || typeof ev !== 'object') return [];

  const idx = typeof ev.index === 'number' ? ev.index : undefined;

  switch (ev.type) {
    case 'content_block_start': {
      if (ev.content_block?.type !== 'text') return [];
      const evt: ParsedEvent = { kind: 'text_start', raw: msg };
      if (idx !== undefined) evt.blockIndex = idx;
      return [evt];
    }
    case 'content_block_delta': {
      if (ev.delta?.type !== 'text_delta') return [];
      const text = ev.delta.text;
      if (typeof text !== 'string' || text.length === 0) return [];
      const evt: ParsedEvent = { kind: 'text_delta', deltaText: text, raw: msg };
      if (idx !== undefined) evt.blockIndex = idx;
      return [evt];
    }
    case 'content_block_stop': {
      const evt: ParsedEvent = { kind: 'text_stop', raw: msg };
      if (idx !== undefined) evt.blockIndex = idx;
      return [evt];
    }
    default:
      // message_start / message_delta / message_stop / input_json_delta 는 UI 에서 다루지 않음.
      return [];
  }
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

  if (json.type === 'stream_event') return parseStreamEvent(json);

  if (json.type === 'result') {
    return [{ kind: 'turn_end', raw: json }];
  }

  if (json.type === 'assistant') {
    // stream_event 로 이미 파셜로 전달된 텍스트는 여기서 중복 처리하지 않도록
    // parseAssistantBlocks 가 text 블록을 건너뛴다. tool_use / artifact / question 만 남는다.
    // 메시지 id 는 stream_event 의 blockId 와 매칭되어야 하므로 ClaudeStreamMessage 에 보관한다.
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
