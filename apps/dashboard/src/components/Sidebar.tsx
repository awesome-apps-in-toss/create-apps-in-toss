import { NavLink, useNavigate } from 'react-router';
import type { AppInfo } from '@/types';

interface SidebarProps {
  apps: AppInfo[];
}

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

export default function Sidebar({ apps }: SidebarProps) {
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <div
        className="sidebar-header"
        onClick={() => void navigate('/')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && void navigate('/')}
      >
        <img
          src="https://static.toss.im/logos/png/4x/logo-apps-in-toss.png"
          alt="토스 미니앱"
          className="sidebar-logo-img"
        />
        <div className="sidebar-subtitle">미니앱 관리 대시보드</div>
      </div>

      <div className="sidebar-section-label">앱 목록</div>

      <nav className="sidebar-apps">
        {apps.map((app, i) => {
          const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
          const initials = displayName.slice(0, 2).toUpperCase();
          const iconUrl = app.granite?.icon;
          const primaryColor = app.granite?.primaryColor;
          const fallback = FALLBACK_COLORS[i % FALLBACK_COLORS.length]!;

          const avatarStyle = primaryColor
            ? { background: hexToRgba(primaryColor, 0.12), color: primaryColor }
            : { background: fallback.bg, color: fallback.color };

          return (
            <NavLink
              key={app.folderName}
              to={`/apps/${app.folderName}`}
              className={({ isActive }) => `sidebar-app-item ${isActive ? 'active' : ''}`}
            >
              <span className="sidebar-app-avatar" style={avatarStyle}>
                {iconUrl ? (
                  <img src={iconUrl} alt={displayName} className="sidebar-app-avatar-img" />
                ) : (
                  initials
                )}
              </span>
              <span className="sidebar-app-name">{displayName}</span>
              <span
                className="sidebar-app-dot"
                style={{ opacity: app.completion >= 100 ? 1 : 0.3 }}
                title={`${app.completion}%`}
              />
            </NavLink>
          );
        })}

        <button className="sidebar-new-app-btn" onClick={() => void navigate('/new-app')}>
          <span className="sidebar-new-app-icon">+</span>
          <span>새 앱 만들기</span>
        </button>
      </nav>
    </aside>
  );
}
