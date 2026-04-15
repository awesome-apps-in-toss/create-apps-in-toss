import { Outlet } from 'react-router';
import Sidebar from '@/components/Sidebar';
import { useApps } from '@/hooks/useApps';

export default function AppLayout() {
  const { apps, isDemo } = useApps();

  return (
    <div className="layout">
      {isDemo && (
        <div className="demo-banner">
          <span className="demo-banner-icon">📌</span>
          <span>
            데모 모드입니다. 실제 앱 데이터와 편집 기능은 로컬에서{' '}
            <code>pnpm dev</code> 실행 후 사용 가능합니다.
          </span>
        </div>
      )}
      <div className={`layout-body${isDemo ? ' layout-body--demo' : ''}`}>
        <Sidebar apps={apps} />
        <div className="layout-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
