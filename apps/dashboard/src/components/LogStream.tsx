import { useEffect, useRef } from 'react';

interface LogStreamProps {
  lines: string[];
  running: boolean;
}

export default function LogStream({ lines, running }: LogStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  if (lines.length === 0 && !running) return null;

  return (
    <div className="log-stream">
      <div className="log-stream-header">
        <span className="log-stream-title">실행 로그</span>
        {running && <span className="log-stream-badge running">실행 중</span>}
        {!running && lines.length > 0 && <span className="log-stream-badge done">완료</span>}
      </div>
      <div className="log-stream-body">
        {lines.map((line, i) => (
          <div key={i} className="log-line">
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
