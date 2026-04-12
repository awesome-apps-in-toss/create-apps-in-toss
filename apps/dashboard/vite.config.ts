import { defineConfig, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VIRTUAL_MODULE_ID = 'virtual:apps';
const RESOLVED_ID = '\0' + VIRTUAL_MODULE_ID;

async function loadApps() {
  const appsDir = join(__dirname, '..');
  const entries = await readdir(appsDir, { withFileTypes: true });

  const apps = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'dashboard') continue;
    try {
      const pkgPath = join(appsDir, entry.name, 'package.json');
      const content = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      apps.push({
        folderName: entry.name,
        name: pkg.name ?? entry.name,
        version: pkg.version ?? '0.0.0',
        description: pkg.description ?? '',
        scripts: pkg.scripts ?? {},
        dependencies: pkg.dependencies ?? {},
        devDependencies: pkg.devDependencies ?? {},
      });
    } catch {
      // package.json 없는 폴더 무시
    }
  }

  return apps.sort((a, b) => a.folderName.localeCompare(b.folderName));
}

function appsDiscoveryPlugin() {
  return {
    name: 'apps-discovery',
    resolveId(id: string) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_ID;
    },
    async load(id: string) {
      if (id === RESOLVED_ID) {
        const apps = await loadApps();
        return `export default ${JSON.stringify(apps)}`;
      }
    },
    configureServer(server: ViteDevServer) {
      const appsDir = join(__dirname, '..');
      server.watcher.add(appsDir);
      server.watcher.on('change', async (file: string) => {
        if (file.endsWith('package.json') && !file.includes('dashboard')) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [appsDiscoveryPlugin(), react(), tsconfigPaths()],
  server: {
    port: 3000,
    host: true,
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
