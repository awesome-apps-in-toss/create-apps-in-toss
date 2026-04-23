import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Info, Menu } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useApps } from '@/hooks/useApps';

export default function AppLayout() {
  const { apps, isDemo } = useApps();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // 경로 변경 시(뒤로가기 등) 모바일 drawer 자동 닫기
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // 모바일 drawer 가 열려있는 동안 Escape 키로 닫히도록.
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  return (
    <div className={`layout${isDemo ? ' layout--demo' : ''}`}>
      {isDemo && (
        <div className="demo-banner" role="status">
          <span className="demo-banner-icon" aria-hidden="true">
            <Info size={16} strokeWidth={2} />
          </span>
          <span>
            데모 모드예요. 실제 앱 데이터와 편집 기능은 로컬에서{' '}
            <code>pnpm dev</code> 를 실행하면 사용할 수 있어요.
          </span>
        </div>
      )}
      <button
        type="button"
        className="hamburger-btn"
        aria-label={mobileOpen ? '사이드바 닫기' : '사이드바 열기'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
      >
        <Menu size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      <div className={`layout-body${isDemo ? ' layout-body--demo' : ''}`}>
        <Sidebar
          apps={apps}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        {mobileOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}
        <div className="layout-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
