#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const appName = process.argv[2];

if (!appName) {
  console.error('Usage: pnpm new-app <app-name>');
  process.exit(1);
}

const appDir = join(rootDir, 'apps', appName);

const files = {
  'package.json': JSON.stringify(
    {
      name: `@barreleye/${appName}`,
      version: '0.0.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'granite dev',
        build: 'ait build',
        typecheck: 'tsc --noEmit',
        lint: 'eslint .',
        preview: 'vite preview',
      },
      dependencies: {
        '@apps-in-toss/web-framework': '^2.0.5',
        '@tanstack/react-query': '^5.62.0',
        '@toss/tds-mobile': '^2.0.0',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        'react-router-dom': '^7.1.0',
      },
      devDependencies: {
        '@barreleye/eslint-config': 'workspace:*',
        '@barreleye/tsconfig': 'workspace:*',
        '@types/react': '^18.3.18',
        '@types/react-dom': '^18.3.5',
        '@vitejs/plugin-react-swc': '^3.7.2',
        eslint: '^9.18.0',
        typescript: '^5.6.3',
        vite: '^6.0.7',
        'vite-tsconfig-paths': '^5.1.4',
      },
    },
    null,
    2
  ),

  'granite.config.ts': `import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: '${appName}',
  brand: {
    displayName: '${appName}',
    primaryColor: '#3182F6',
    icon: 'https://static.toss.im/icons/png/4x/icon-person-man.png',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'tsc -b && vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
  webViewProps: {
    type: 'partner',
  },
});
`,

  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
`,

  'tsconfig.json': JSON.stringify(
    {
      extends: '@barreleye/tsconfig/react.json',
      compilerOptions: {
        baseUrl: '.',
        paths: { '@/*': ['./src/*'] },
      },
      include: ['src', 'vite.config.ts'],
      exclude: ['granite.config.ts'],
    },
    null,
    2
  ),

  'eslint.config.js': `import reactConfig from '@barreleye/eslint-config/react';

export default reactConfig;
`,

  'index.html': `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${appName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  'src/main.tsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryProvider } from '@/providers/QueryProvider';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <QueryProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryProvider>
  </StrictMode>
);
`,

  'src/App.tsx': `import { Routes, Route, Link } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';

function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/">홈</Link>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
`,

  'src/pages/HomePage.tsx': `export function HomePage() {
  return (
    <section className="card">
      <h1>${appName}</h1>
      <p>새 미니앱입니다.</p>
    </section>
  );
}
`,

  'src/providers/QueryProvider.tsx': `import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
`,

  'src/index.css': `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f5f5f5;
  color: #191f28;
  line-height: 1.5;
}

.app {
  min-height: 100vh;
  padding: 16px;
}

.nav {
  display: flex;
  gap: 16px;
  padding: 12px 0;
  margin-bottom: 16px;
  border-bottom: 1px solid #e5e8eb;
}

.nav a {
  color: #3182f6;
  text-decoration: none;
  font-weight: 500;
}

.main {
  max-width: 480px;
  margin: 0 auto;
}

.card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.card h1 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 12px;
}

.card p {
  color: #4e5968;
  font-size: 14px;
}
`,
};

async function createApp() {
  console.log(`Creating new app: ${appName}`);

  await mkdir(join(appDir, 'src/pages'), { recursive: true });
  await mkdir(join(appDir, 'src/providers'), { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    const filePath = join(appDir, filename);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    console.log(`  Created: ${filename}`);
  }

  console.log(`\nDone! Run the following commands:`);
  console.log(`  pnpm install`);
  console.log(`  pnpm --filter @barreleye/${appName} dev`);
}

createApp().catch(console.error);
