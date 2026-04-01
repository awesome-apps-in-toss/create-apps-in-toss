# 새 미니앱 생성

## 빠른 시작

```bash
pnpm new-app my-app
pnpm install
pnpm --filter @barreleye/my-app dev
```

## 생성되는 구조

```
apps/my-app/
├── src/
│   ├── pages/
│   │   └── HomePage.tsx
│   ├── providers/
│   │   └── QueryProvider.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── granite.config.ts      # 앱인토스 설정
├── vite.config.ts
├── tsconfig.json
├── eslint.config.js
├── index.html
└── package.json
```

## 설정 수정

### granite.config.ts

앱인토스 콘솔에 등록한 정보로 수정:

```typescript
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'my-app', // 콘솔에 등록한 앱 ID
  brand: {
    displayName: '내 앱', // 사용자에게 보이는 이름
    primaryColor: '#3182F6', // 브랜드 색상
    icon: 'https://...', // 앱 아이콘 URL
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'tsc -b && vite build',
    },
  },
  permissions: [
    // 필요한 권한 추가
    { name: 'clipboard', access: 'read' },
  ],
  outdir: 'dist',
  webViewProps: {
    type: 'partner', // 비게임: 'partner', 게임: 'game'
  },
});
```

### 새 페이지 추가

```typescript
// src/pages/SettingsPage.tsx
export function SettingsPage() {
  return <div>설정</div>;
}

// src/App.tsx
import { SettingsPage } from '@/pages/SettingsPage';

<Routes>
  <Route path="/" element={<HomePage />} />
  <Route path="/settings" element={<SettingsPage />} />
</Routes>
```

## 주의사항

### 포트 일치

`granite.config.ts`의 `web.port`와 `vite.config.ts`의 `server.port`는 반드시 같아야 합니다.
불일치 시 시뮬레이터/실기기에서 무한 로딩이 발생합니다.

### 실기기 테스트

실기기에서 접근하려면 `granite.config.ts`를 수정하세요:

```typescript
web: {
  host: '192.168.x.x', // 로컬 네트워크 IP (ifconfig로 확인)
  commands: {
    dev: 'vite --host', // --host 옵션 추가
  },
},
```

### 빌드 커맨드

- **dev**: `granite dev` (SDK 2.x에서도 동일)
- **build**: `ait build` (SDK 2.x부터 변경, `granite build`는 1.x 전용)

## 체크리스트

- [ ] `granite.config.ts`에 올바른 appName 설정
- [ ] 브랜드 정보 (displayName, primaryColor, icon) 설정
- [ ] `webViewProps.type` 설정 (`'partner'` 또는 `'game'`)
- [ ] `web.port`와 `vite.config.ts`의 `server.port` 일치 확인
- [ ] 필요한 permissions 추가
- [ ] TDS 컴포넌트 사용 (비게임 필수)
