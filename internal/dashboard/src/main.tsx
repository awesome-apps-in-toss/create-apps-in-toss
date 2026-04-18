import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import AppLayout from './layouts/AppLayout';
import Home from './pages/Home';
import AppDetail from './pages/AppDetail';
import NewApp from './pages/NewApp';
import Wizard from './pages/Wizard';
import { AppsProvider } from './hooks/useApps';
import { SkillsProvider } from './hooks/useSkills';
import './App.css';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <Home /> },
        { path: 'apps/:appId', element: <AppDetail /> },
        { path: 'new-app', element: <NewApp /> },
        { path: 'wizard/:appId', element: <Wizard /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL }
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppsProvider>
      <SkillsProvider>
        <RouterProvider router={router} />
      </SkillsProvider>
    </AppsProvider>
  </StrictMode>
);
