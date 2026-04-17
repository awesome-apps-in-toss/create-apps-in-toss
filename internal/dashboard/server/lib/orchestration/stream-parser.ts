// NOTE: Claude CLI stream-json 이벤트 shape는 공식 스펙 변동 가능.
// 알 수 없는 type은 'log'로 fallback하여 사용자가 raw를 볼 수 있게 한다.
// 현재 가정(claude CLI ~1.x 기준):
//   { type: 'system', ... }            → 로그
//   { type: 'assistant', message: { content: [{ type: 'text', text }, ...] } } → 로그(텍스트)
//   { type: 'user', ... }              → 로그
//   { type: 'tool_use', name, input }  → 도구 호출. Write/Edit 감지 시 artifact 후보
//   { type: 'result', ... }            → done

export type ParsedEventKind = 'log' | 'artifact' | 'done' | 'question' | 'unknown';

export interface ParsedEvent {
  kind: ParsedEventKind;
  message?: string;
  artifact?: { path?: string; preview?: string };
  raw: unknown;
}

interface ClaudeStreamMessage {
  type?: string;
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
  };
  name?: string;
  input?: { file_path?: string; path?: string; content?: string };
  result?: { ok?: boolean };
}

function extractTextFromMessage(msg: ClaudeStreamMessage['message']): string | null {
  const content = msg?.content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

function detectArtifact(msg: ClaudeStreamMessage): ParsedEvent | null {
  const toolName = msg.name;
  const input = msg.input;
  if (!toolName || !input) return null;
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'NotebookEdit') {
    const p = input.file_path ?? input.path;
    if (typeof p === 'string') {
      return {
        kind: 'artifact',
        artifact: { path: p },
        raw: msg,
      };
    }
  }
  return null;
}

/** Parse a single line from Claude CLI stream-json stdout. */
export function parseStreamLine(line: string): ParsedEvent {
  const trimmed = line.trim();
  if (!trimmed) return { kind: 'unknown', raw: line };

  let json: ClaudeStreamMessage;
  try {
    json = JSON.parse(trimmed) as ClaudeStreamMessage;
  } catch {
    return { kind: 'log', message: trimmed, raw: trimmed };
  }

  if (json.type === 'result') {
    return { kind: 'done', raw: json };
  }

  if (json.type === 'assistant' || json.type === 'user' || json.type === 'system') {
    const text = extractTextFromMessage(json.message);
    if (text) return { kind: 'log', message: text, raw: json };
    return { kind: 'log', message: trimmed, raw: json };
  }

  if (json.type === 'tool_use') {
    const artifact = detectArtifact(json);
    if (artifact) return artifact;
    return { kind: 'log', message: `[tool: ${json.name ?? 'unknown'}]`, raw: json };
  }

  return { kind: 'log', message: trimmed, raw: json };
}
