import { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { CheckCircle2, Plus } from 'lucide-react';
import type { AppInfo } from '@/types';
import { getFallbackColor, hexToRgba } from '@/lib/palette';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/hooks/useTheme';

interface SidebarProps {
  apps: AppInfo[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ apps, mobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate();
  // 테마 변경 시 fallback 아바타 색상이 재계산되도록 구독.
  useTheme();
  const firstNavRef = useRef<HTMLAnchorElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // 모바일 drawer 가 열리면 첫 네비게이션 항목으로 포커스 이동.
  // (키보드/스크린리더 사용자가 스크림을 지나치지 않게 하는 표준 a11y 패턴)
  useEffect(() => {
    if (!mobileOpen) return;
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;
    const t = window.setTimeout(() => {
      firstNavRef.current?.focus();
    }, 150);
    return () => window.clearTimeout(t);
  }, [mobileOpen]);

  // 모바일 drawer 전용 ESC 닫기 + 포커스 트랩. 닫힐 때 이전 포커스로 복원.
  useEffect(() => {
    if (!mobileOpen) return;
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const root = asideRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        onMobileClose?.();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getAttribute('aria-hidden') !== 'true');
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !root.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [mobileOpen, onMobileClose]);

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
    <aside
      ref={asideRef}
      className={`sidebar${mobileOpen ? ' sidebar--mobile-open' : ''}`}
      aria-label="앱 목록"
      {...(mobileOpen ? { role: 'dialog', 'aria-modal': 'true' as const } : {})}
    >
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

      <div className="sidebar-section-label">
        <span>앱 목록</span>
        {apps.length > 0 && <span className="sidebar-section-count">{apps.length}</span>}
      </div>

      <nav className="sidebar-apps">
        {apps.map((app, i) => {
          const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
          const initials = displayName.slice(0, 2).toUpperCase();
          const iconUrl = app.granite?.icon;
          const primaryColor = app.granite?.primaryColor;
          const fallback = getFallbackColor(i);
          const isComplete = app.completion >= 100;

          const avatarStyle = primaryColor
            ? { background: hexToRgba(primaryColor, 0.12), color: primaryColor }
            : { background: fallback.bg, color: fallback.color };

          return (
            <NavLink
              key={app.folderName}
              to={`/apps/${app.folderName}`}
              className={({ isActive }) => `sidebar-app-item ${isActive ? 'active' : ''}`}
              onClick={handleNavClick}
              ref={i === 0 ? firstNavRef : undefined}
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
              {isComplete ? (
                <span
                  className="sidebar-app-status sidebar-app-status--done"
                  title="완료"
                  aria-hidden="true"
                >
                  <CheckCircle2 size={12} strokeWidth={2} />
                </span>
              ) : (
                <span
                  className="sidebar-app-status sidebar-app-status--pct"
                  title={`${app.completion}%`}
                  aria-hidden="true"
                >
                  {app.completion}
                </span>
              )}
              <span className="sr-only">{app.completion}% 완료</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          className="sidebar-new-app-btn"
          onClick={handleNewAppClick}
        >
          <span className="sidebar-new-app-icon" aria-hidden="true">
            <Plus size={14} strokeWidth={2.25} />
          </span>
          <span>새 앱 만들기</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <ThemeToggle />
      </div>
    </aside>
  );
}
