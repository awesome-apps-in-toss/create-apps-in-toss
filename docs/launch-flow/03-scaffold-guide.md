# 3단계: 스캐폴딩 (Scaffold Guide)

## 목적

모노레포 내에서 새 미니앱 프로젝트를 생성하고 기본 설정을 완료한다.

## 스캐폴딩 커맨드

```bash
pnpm new-app <app-name>
pnpm install
```

## 생성되는 구조

```
apps/<app-name>/
├── src/
│   ├── pages/
│   │   └── HomePage.tsx
│   ├── providers/
│   │   └── QueryProvider.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── granite.config.ts      # 앱인토스 설정 (핵심)
├── vite.config.ts
├── tsconfig.json
├── eslint.config.js
├── index.html
└── package.json
```

## granite.config.ts 설정

스캐폴딩 후 반드시 수정해야 하는 설정:

```typescript
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: '<콘솔에 등록한 appName>', // 필수: 콘솔 앱 ID와 동일
  brand: {
    displayName: '<한국어 앱 이름>', // 필수: 사용자에게 보이는 이름
    primaryColor: '#XXXXXX', // 필수: 브랜드 컬러 HEX
    icon: '<콘솔 업로드 후 URL>', // 필수: 앱 로고 URL
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'tsc -b && vite build',
    },
  },
  navigationBar: {
    withBackButton: true, // 하위 화면 뒤로가기 버튼
    withHomeButton: true, // 홈 버튼 (선택)
  },
  permissions: [
    // 필요한 권한만 추가
    // { name: 'clipboard', access: 'read' },
    // { name: 'clipboard', access: 'write' },
    // { name: 'contacts', access: 'read' },
    // { name: 'photos', access: 'read' },
    // { name: 'geolocation', access: 'access' },
    // { name: 'camera', access: 'access' },
    // { name: 'microphone', access: 'access' },
  ],
  outdir: 'dist',
  webViewProps: {
    type: 'partner', // 비게임: 'partner', 게임: 'game'
  },
});
```

### vite.config.ts 확인

스캐폴드가 생성한 기본 설정을 확인:

- `server.port`: granite.config.ts의 `web.port`와 일치해야 함 (기본 5173)
- `build.outDir`: `dist` (granite.config.ts의 `outdir`과 일치)

## 주요 커맨드

| 커맨드                                    | 설명                                   |
| ----------------------------------------- | -------------------------------------- |
| `granite dev`                             | 개발 서버 실행 (SDK dev server + Vite) |
| `ait build`                               | 프로덕션 빌드 (.ait 파일 생성)         |
| `pnpm --filter @barreleye/<app-name> dev` | 특정 앱 개발 서버 실행                 |

## 실기기 테스트 설정

로컬 네트워크에서 실기기 접근 시:

```typescript
web: {
  host: '192.168.x.x',  // 로컬 IP (ipconfig로 확인)
  commands: {
    dev: 'vite --host',  // --host 옵션 추가
    build: 'tsc -b && vite build',
  },
},
```

Android 포트 포워딩:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5173 tcp:5173
```

## docs/ 폴더 생성

앱별 기획 문서를 위한 docs 폴더를 생성한다:

```
apps/<app-name>/docs/
├── planning.md     # 기획서
└── tech-spec.md    # 기술 명세 (선택)
```

## 스캐폴딩 체크리스트

- [ ] `pnpm new-app <app-name>` 실행
- [ ] `pnpm install` 실행
- [ ] `granite.config.ts`의 `appName`을 콘솔 등록 ID로 수정
- [ ] `brand.displayName` 수정
- [ ] `brand.primaryColor` 수정
- [ ] `brand.icon` 수정 (또는 빈 문자열로 임시 설정)
- [ ] `webViewProps.type` 설정 ('partner' 또는 'game')
- [ ] `navigationBar` 설정 (`withBackButton`, `withHomeButton`)
- [ ] `web.port`와 `vite.config.ts`의 `server.port` 일치 확인
- [ ] 필요한 `permissions` 추가
- [ ] `pnpm --filter @barreleye/<app-name> dev`로 개발 서버 실행 확인
- [ ] `apps/<app-name>/docs/` 폴더에 기획서 배치
