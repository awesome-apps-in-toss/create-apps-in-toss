import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import AppLayout from './layouts/AppLayout';
import Home from './pages/Home';
import AppDetail from './pages/AppDetail';
import { AppsProvider } from './hooks/useApps';
import { SkillsProvider } from './hooks/useSkills';
import { ThemeProvider } from './hooks/useTheme';
import './App.css';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <Home /> },
        { path: 'apps/:appId', element: <AppDetail /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL }
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AppsProvider>
        <SkillsProvider>
          <RouterProvider router={router} />
        </SkillsProvider>
      </AppsProvider>
    </ThemeProvider>
  </StrictMode>
);
