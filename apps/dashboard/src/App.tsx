import apps, { type AppPackage } from 'virtual:apps';

const AVATAR_COLORS = [
  { bg: '#dbeafe', color: '#1d4ed8' },
  { bg: '#ede9fe', color: '#6d28d9' },
  { bg: '#dcfce7', color: '#15803d' },
  { bg: '#ffedd5', color: '#c2410c' },
  { bg: '#fce7f3', color: '#be185d' },
  { bg: '#ccfbf1', color: '#0f766e' },
  { bg: '#fef9c3', color: '#854d0e' },
];

function formatDisplayName(folderName: string) {
  return folderName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getInitials(displayName: string) {
  const words = displayName.split(' ');
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}

interface Tag {
  label: string;
  className: string;
}

function getTags(deps: Record<string, string>): Tag[] {
  const tags: Tag[] = [];
  if (deps['@toss/tds-mobile'] || deps['@toss-design-system/mobile']) {
    tags.push({ label: 'TDS', className: 'tag-tds' });
  }
  if (deps['@apps-in-toss/web-framework']) {
    tags.push({ label: 'AppsInToss', className: 'tag-ait' });
  }
  if (deps['@tanstack/react-query']) {
    tags.push({ label: 'TanStack Query', className: 'tag-tanstack' });
  }
  if (deps['react-router-dom']) {
    tags.push({ label: 'Router', className: 'tag-router' });
  }
  if (deps['zustand']) {
    tags.push({ label: 'Zustand', className: 'tag-zustand' });
  }
  return tags;
}

interface ProcessedApp extends AppPackage {
  displayName: string;
  initials: string;
  color: (typeof AVATAR_COLORS)[number];
  tags: Tag[];
  devCommand: string;
}

function processApps(rawApps: AppPackage[]): ProcessedApp[] {
  return rawApps.map((app, i) => {
    const displayName = formatDisplayName(app.folderName);
    return {
      ...app,
      displayName,
      initials: getInitials(displayName),
      color: AVATAR_COLORS[i % AVATAR_COLORS.length]!,
      tags: getTags(app.dependencies),
      devCommand: `pnpm --filter ${app.name} dev`,
    };
  });
}

const appList = processApps(apps);
const miniAppCount = appList.filter((a) => a.dependencies['@apps-in-toss/web-framework']).length;

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <span className="header-logo">🛢 Barreleye</span>
          <span className="header-divider" />
          <span className="header-subtitle">앱 대시보드</span>
        </div>
      </header>

      <main className="main">
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{appList.length}</div>
            <div className="stat-label">전체 앱</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{miniAppCount}</div>
            <div className="stat-label">토스 미니앱</div>
          </div>
        </div>

        <h2 className="section-title">앱 목록</h2>

        <div className="apps-grid">
          {appList.map((app) => (
            <div key={app.folderName} className="app-card">
              <div className="app-card-header">
                <div
                  className="app-avatar"
                  style={{ background: app.color.bg, color: app.color.color }}
                >
                  {app.initials}
                </div>
                <div className="app-info">
                  <div className="app-name">{app.displayName}</div>
                  <div className="app-package">{app.name}</div>
                </div>
                <span className="app-version">{app.version}</span>
              </div>

              {app.description && <p className="app-description">{app.description}</p>}

              {app.tags.length > 0 && (
                <div className="tags">
                  {app.tags.map((tag) => (
                    <span key={tag.label} className={`tag ${tag.className}`}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}

              <div className="dev-command-section">
                <span className="dev-command-label">실행 방법</span>
                <div className="dev-command">
                  <span className="prompt-symbol">$</span>
                  <code>{app.devCommand}</code>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
