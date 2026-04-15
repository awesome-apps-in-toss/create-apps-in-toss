interface CompletionDotsProps {
  completion: number;
  total?: number;
}

export default function CompletionDots({ completion, total = 5 }: CompletionDotsProps) {
  const filled = Math.round((completion / 100) * total);
  return (
    <span className="completion-dots" title={`${completion}%`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`completion-dot ${i < filled ? 'filled' : ''}`} />
      ))}
      <span className="completion-pct">{completion}%</span>
    </span>
  );
}
