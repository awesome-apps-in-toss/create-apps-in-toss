import { NavLink, useNavigate } from 'react-router';
import type { AppInfo } from '@/types';
import { getFallbackColor, hexToRgba } from '@/lib/palette';

interface SidebarProps {
  apps: AppInfo[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ apps, mobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate();

  const handleHeaderClick = () => {
    void navigate('/');
    onMobileClose?.();
  };

  const handleNewAppClick = () => {
    void navigate('/new-app');
    onMobileClose?.();
  };

  const handleNavClick = () => {
    onMobileClose?.();
  };

  return (
    <aside className={`sidebar${mobileOpen ? ' sidebar--mobile-open' : ''}`}>
      <button
        type="button"
        className="sidebar-header"
        onClick={handleHeaderClick}
      >
        <img
          src="https://static.toss.im/logos/png/4x/logo-apps-in-toss.png"
          alt="토스 미니앱"
          className="sidebar-logo-img"
          loading="lazy"
          decoding="async"
          height={20}
        />
        <div className="sidebar-subtitle">미니앱 관리 대시보드</div>
      </button>

      <div className="sidebar-section-label">앱 목록</div>

      <nav className="sidebar-apps">
        {apps.map((app, i) => {
          const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
          const initials = displayName.slice(0, 2).toUpperCase();
          const iconUrl = app.granite?.icon;
          const primaryColor = app.granite?.primaryColor;
          const fallback = getFallbackColor(i);

          const avatarStyle = primaryColor
            ? { background: hexToRgba(primaryColor, 0.12), color: primaryColor }
            : { background: fallback.bg, color: fallback.color };

          return (
            <NavLink
              key={app.folderName}
              to={`/apps/${app.folderName}`}
              className={({ isActive }) => `sidebar-app-item ${isActive ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              <span className="sidebar-app-avatar" style={avatarStyle}>
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt={displayName}
                    className="sidebar-app-avatar-img"
                    loading="lazy"
                    decoding="async"
                    width={22}
                    height={22}
                  />
                ) : (
                  initials
                )}
              </span>
              <span className="sidebar-app-name">{displayName}</span>
              <span
                className="sidebar-app-dot"
                style={{ opacity: app.completion >= 100 ? 1 : 0.3 }}
                title={`${app.completion}%`}
                aria-hidden="true"
              />
              <span className="sr-only">{app.completion}% 완료</span>
            </NavLink>
          );
        })}

        <button className="sidebar-new-app-btn" onClick={handleNewAppClick}>
          <span className="sidebar-new-app-icon">+</span>
          <span>새 앱 만들기</span>
        </button>
      </nav>
    </aside>
  );
}
