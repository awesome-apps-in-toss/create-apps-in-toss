# 3단계: 스캐폴딩 (Scaffold Guide)

## 목적

모노레포 내에 **일단 켜지는 최소 앱 구조**를 생성하고, 기획서(PRD) 에 근거해 필요한 추가 기능만 골라서 붙인다.

## 설계 원칙 — 왜 최소 구조인가

예전에는 `pnpm new-app` 한 번에 React Router · TanStack Query · TDS 가 전부 박혀 나왔다.
하지만 실제로는 화면이 하나뿐인 앱, 게임(TDS 불필요), 서버 호출이 없는 앱도 많다.
**필요한 것만 넣어야** 번들 크기와 학습량이 같이 줄어든다.

그래서 스캐폴딩은 두 단계로 나뉜다:

1. `pnpm new-app <app-name>` — 최소 구조만 생성 (React + Vite + granite)
2. `/ait-add-routing`, `/ait-add-query`, `/ait-tds-setup` — PRD 를 보고 필요한 것만 추가

`/ait-scaffold` 스킬은 이 두 단계를 **대화형으로 한 번에** 진행한다.

## 1) 최소 스캐폴딩

```bash
pnpm new-app <app-name>
pnpm install
```

기본 포함:

- `react`, `react-dom`
- `@apps-in-toss/web-framework` (granite 필수)
- TypeScript, Vite, ESLint, `@barreleye/tsconfig`, `@barreleye/eslint-config`

생성되는 구조:

```
apps/<app-name>/
├── src/
│   ├── App.tsx            # "/ait-add-* 스킬 안내" 가 적힌 단일 화면
│   ├── main.tsx
│   └── index.css
├── granite.config.ts      # 앱인토스 설정 (핵심)
├── vite.config.ts
├── tsconfig.json
├── eslint.config.js
├── index.html
└── package.json
```

> `src/pages/` · `providers/QueryProvider.tsx` 는 **기본 포함이 아님**. 해당 기능 스킬을 돌릴 때 생성된다.

## 2) granite.config.ts 설정

스캐폴딩 직후 반드시 손봐야 하는 값:

```typescript
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: '<콘솔에 등록한 appName>', // 필수: 콘솔 앱 ID 와 동일
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

스캐폴드가 생성한 기본 설정 검증:

- `server.port` — granite.config.ts 의 `web.port` 와 일치 (기본 5173)
- `build.outDir` — `dist` (granite.config.ts 의 `outdir` 과 일치)

## 3) PRD 기반 추가 기능 선택

`app.console.prdPath` 또는 `docs/prd/*.md` 를 읽고, 아래 기능을 **각각 AskUserQuestion 으로 확인**한 뒤 승인된 것만 연쇄 실행한다.

| 기능 | 판단 기준 | 설치 스킬 |
|------|-----------|-----------|
| 화면 이동 (React Router) | PRD 에 "홈/상세/결과" 같은 **2개 이상 화면**이 등장 | `/ait-add-routing` |
| 서버 데이터 (TanStack Query) | PRD 에 "API", "서버에서 가져와서", "외부 데이터" 문구가 있거나 로컬 저장으로 충분하지 않을 때 | `/ait-add-query` |
| 토스 스타일 UI (TDS) | 비게임(`partner`) 앱이면 기본 제안 (앱인토스 정책상 **필수**). 게임은 스킵 | `/ait-tds-setup` |

"모르겠으면 스킵해도 됨. 나중에 다시 붙일 수 있음" 이라는 안전망 문구를 질문에 포함한다.

각 스킬은 독립적으로 idempotent 하므로, 이미 설치된 기능은 재실행해도 중복되지 않는다.

## 4) 실기기 테스트 (필요할 때만)

로컬 네트워크에서 실기기 접근 시:

```typescript
web: {
  host: '192.168.x.x',  // 로컬 IP (ipconfig 로 확인)
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

## 5) docs/ 폴더

앱별 기획 문서 배치 위치:

```
apps/<app-name>/docs/
├── planning.md     # 기획서
└── tech-spec.md    # 기술 명세 (선택)
```

## 주요 커맨드

| 커맨드                                    | 설명                                   |
| ----------------------------------------- | -------------------------------------- |
| `granite dev`                             | 개발 서버 실행 (SDK dev server + Vite) |
| `ait build`                               | 프로덕션 빌드 (.ait 파일 생성)         |
| `pnpm --filter @barreleye/<app-name> dev` | 특정 앱 개발 서버 실행                 |

## 스캐폴딩 체크리스트

- [ ] `pnpm new-app <app-name>` 실행
- [ ] `pnpm install` 실행
- [ ] `granite.config.ts` 의 `appName` 을 콘솔 등록 ID 로 수정
- [ ] `brand.displayName` 수정
- [ ] `brand.primaryColor` 수정
- [ ] `brand.icon` 수정 (또는 빈 문자열로 임시 설정)
- [ ] `webViewProps.type` 설정 ('partner' 또는 'game')
- [ ] `navigationBar` 설정 (`withBackButton`, `withHomeButton`)
- [ ] `web.port` 와 `vite.config.ts` 의 `server.port` 일치 확인
- [ ] 필요한 `permissions` 추가
- [ ] PRD 기반으로 `/ait-add-routing` · `/ait-add-query` · `/ait-tds-setup` 중 필요한 것 설치
- [ ] `pnpm --filter @barreleye/<app-name> dev` 로 개발 서버 실행 확인
- [ ] `apps/<app-name>/docs/` 폴더에 기획서 배치
