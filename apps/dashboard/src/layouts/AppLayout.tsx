import { Outlet } from 'react-router';
import Sidebar from '@/components/Sidebar';
import { useApps } from '@/hooks/useApps';

export default function AppLayout() {
  const { apps } = useApps();

  return (
    <div className="layout">
      <Sidebar apps={apps} />
      <div className="layout-content">
        <Outlet />
      </div>
    </div>
  );
}
