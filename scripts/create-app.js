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

/**
 * 최소 스캐폴딩. 여기서는 "앱이 일단 켜지는 최소 구성"만 만든다.
 *   - React + Vite + TypeScript
 *   - @apps-in-toss/web-framework (granite.config.ts 필수)
 * 추가 라이브러리(@toss/tds-mobile, @tanstack/react-query, react-router-dom 등)는
 * 각자 /ait-add-* 스킬에서 필요한 앱에만 붙인다.
 */
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
        react: '^18.3.1',
        'react-dom': '^18.3.1',
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
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`,

  'src/App.tsx': `export default function App() {
  return (
    <main className="app">
      <section className="card">
        <h1>${appName}</h1>
        <p>새 미니앱입니다. 아래 스킬로 필요한 기능을 하나씩 추가해보세요.</p>
        <ul className="tips">
          <li><code>/ait-add-routing</code> — 여러 화면을 오갈 수 있게 해줘요</li>
          <li><code>/ait-add-query</code> — 서버에서 데이터를 받아와 보여줘요</li>
          <li><code>/ait-tds-setup</code> — 토스 스타일 UI 컴포넌트를 추가해줘요</li>
        </ul>
      </section>
    </main>
  );
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
  margin-bottom: 12px;
}

.tips {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #4e5968;
}

.tips code {
  background: #f2f4f6;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}
`,
};

async function createApp() {
  console.log(`Creating new app: ${appName}`);

  await mkdir(join(appDir, 'src'), { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    const filePath = join(appDir, filename);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    console.log(`  Created: ${filename}`);
  }

  console.log(`\nDone! Run the following commands:`);
  console.log(`  pnpm install`);
  console.log(`  pnpm --filter @barreleye/${appName} dev`);
  console.log(`\n추가 기능은 아래 스킬로 붙이세요:`);
  console.log(`  /ait-add-routing       — 화면 이동 설정 (React Router)`);
  console.log(`  /ait-add-query         — 서버 데이터 연결 (TanStack Query)`);
  console.log(`  /ait-tds-setup         — 토스 스타일 UI (TDS)`);
}

createApp().catch(console.error);
