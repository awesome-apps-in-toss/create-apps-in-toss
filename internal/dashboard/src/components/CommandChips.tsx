import { useState } from 'react';
import { Copy, Terminal } from 'lucide-react';
import { buildLaunchCommands } from '@/lib/commands';

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

/**
 * 한 단계(skill)를 터미널에서 실행하기 위한 claude / codex 명령 복사 칩.
 * 대시보드는 실행하지 않고 "복사 → 사용자가 앱 폴더에서 직접 실행" 흐름만 안내한다.
 */
export default function CommandChips({
  skill,
  hint = '앱 폴더에서 실행하세요',
}: {
  skill: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const commands = buildLaunchCommands(skill);

  async function handleCopy(tool: string, command: string) {
    await copyText(command);
    setCopied(tool);
    setTimeout(() => setCopied((c) => (c === tool ? null : c)), 2000);
  }

  return (
    <div className="command-chips" role="group" aria-label={`${skill} 실행 명령`}>
      {commands.map(({ tool, label, command }) => (
        <button
          key={tool}
          type="button"
          className={`btn-cli-chip ${copied === tool ? 'btn-cli-chip--copied' : ''}`}
          onClick={() => void handleCopy(tool, command)}
          title={hint}
          aria-label={`${label} 명령 복사`}
        >
          <span className="btn-cli-chip-tool">
            <Terminal size={11} strokeWidth={2} aria-hidden="true" />
            {label}
          </span>
          <code>{command}</code>
          <Copy size={12} strokeWidth={2} aria-hidden="true" />
          <span className="btn-cli-chip-feedback" aria-live="polite">
            {copied === tool ? '복사됨' : '복사'}
          </span>
        </button>
      ))}
    </div>
  );
}
