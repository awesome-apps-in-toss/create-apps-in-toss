import type { AppInfo } from '@/types';
import { getFallbackColor, hexToRgba } from '@/lib/palette';
import { useTheme } from '@/hooks/useTheme';

interface AppAvatarProps {
  app: AppInfo;
  index: number;
  size?: 'sm' | 'md';
}

export default function AppAvatar({ app, index, size = 'md' }: AppAvatarProps) {
  // 테마 변경 시 fallback 색상이 재계산되도록 context 를 구독.
  useTheme();
  const iconUrl = app.granite?.icon;
  const primaryColor = app.granite?.primaryColor;
  const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
  const initials = displayName.slice(0, 2).toUpperCase();
  const sizeClass = size === 'sm' ? 'app-avatar-sm' : 'app-avatar';
  const imgSize = size === 'sm' ? 22 : 40;

  if (iconUrl) {
    return (
      <div
        className={sizeClass}
        style={
          primaryColor
            ? { background: hexToRgba(primaryColor, 0.12) }
            : { background: getFallbackColor(index).bg }
        }
      >
        <img
          src={iconUrl}
          alt={displayName}
          className="app-avatar-img"
          loading="lazy"
          decoding="async"
          width={imgSize}
          height={imgSize}
        />
      </div>
    );
  }

  if (primaryColor) {
    return (
      <div
        className={sizeClass}
        style={{ background: hexToRgba(primaryColor, 0.12), color: primaryColor }}
        aria-hidden="true"
      >
        {initials}
      </div>
    );
  }

  const fallback = getFallbackColor(index);
  return (
    <div
      className={sizeClass}
      style={{ background: fallback.bg, color: fallback.color }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
