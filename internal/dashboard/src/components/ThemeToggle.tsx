import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/hooks/useTheme';

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: '라이트', Icon: Sun },
  { value: 'dark', label: '다크', Icon: Moon },
  { value: 'system', label: '시스템', Icon: Monitor },
];

/**
 * 라이트 / 다크 / 시스템 3단 세그먼트 토글.
 * Sidebar 하단에 배치. 선택은 즉시 <html data-theme> 에 반영된다.
 */
export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="theme-toggle"
      role="radiogroup"
      aria-label="테마 선택"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            className={`theme-toggle-btn${active ? ' theme-toggle-btn--active' : ''}`}
            role="radio"
            aria-checked={active}
            aria-label={`${label} 테마`}
            title={label}
            onClick={() => setPreference(value)}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className="theme-toggle-btn-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
