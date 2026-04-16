import type { AppInfo } from '@/types';

const FALLBACK_COLORS = [
  { bg: '#dbeafe', color: '#1d4ed8' },
  { bg: '#ede9fe', color: '#6d28d9' },
  { bg: '#dcfce7', color: '#15803d' },
  { bg: '#ffedd5', color: '#c2410c' },
  { bg: '#fce7f3', color: '#be185d' },
  { bg: '#ccfbf1', color: '#0f766e' },
  { bg: '#fef9c3', color: '#854d0e' },
];

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface AppAvatarProps {
  app: AppInfo;
  index: number;
  size?: 'sm' | 'md';
}

export default function AppAvatar({ app, index, size = 'md' }: AppAvatarProps) {
  const iconUrl = app.granite?.icon;
  const primaryColor = app.granite?.primaryColor;
  const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
  const initials = displayName.slice(0, 2).toUpperCase();
  const sizeClass = size === 'sm' ? 'app-avatar-sm' : 'app-avatar';

  if (iconUrl) {
    return (
      <div
        className={sizeClass}
        style={
          primaryColor
            ? { background: hexToRgba(primaryColor, 0.12) }
            : { background: FALLBACK_COLORS[index % FALLBACK_COLORS.length]!.bg }
        }
      >
        <img src={iconUrl} alt={displayName} className="app-avatar-img" />
      </div>
    );
  }

  if (primaryColor) {
    return (
      <div
        className={sizeClass}
        style={{ background: hexToRgba(primaryColor, 0.12), color: primaryColor }}
      >
        {initials}
      </div>
    );
  }

  const fallback = FALLBACK_COLORS[index % FALLBACK_COLORS.length]!;
  return (
    <div className={sizeClass} style={{ background: fallback.bg, color: fallback.color }}>
      {initials}
    </div>
  );
}
