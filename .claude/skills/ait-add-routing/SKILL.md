---
name: ait-add-routing
description: 미니앱에 화면 이동(라우팅) 기능을 추가합니다. React Router 를 설치하고 기본 페이지 구조를 잡아줍니다.
argument-hint: '<app-name>'
mode: automated
step: null
label: 화면 이동 설정
produces: React Router + 페이지 폴더 구조
requires: [ait-scaffold]
inputs:
  - { key: appName, type: text, required: true }
outputs:
  - { key: routerSetup, type: config, path: 'apps/<appName>/src/App.tsx' }
idempotencyKey: ait-add-routing
---

# 화면 이동(라우팅) 추가

미니앱이 여러 화면으로 나뉠 때, 화면을 옮겨다닐 수 있게 해주는 **React Router** 를 설치합니다.
"홈 → 상세 → 결과" 처럼 3~4개 이상 화면이 필요하면 붙이세요.

## 쓰기 좋은 때

- 메인 화면 외에 "상세 보기", "설정", "결과 공유" 같은 보조 화면이 있을 때
- 뒤로가기/앞으로 보내기 를 기대하게 되는 플로우일 때

반대로 단일 화면 모달로 충분하면 굳이 넣지 말고 상태값만으로 처리하세요.

## 실행 절차

1. 앱 디렉토리 확인: `apps/<app-name>/`. 없으면 먼저 `/ait-scaffold` 를 돌리세요.

2. 패키지 설치
   ```bash
   pnpm --filter @barreleye/<app-name> add react-router-dom
   ```

3. `src/main.tsx` 에 `BrowserRouter` 래핑 추가

4. `src/App.tsx` 를 `Routes` / `Route` 구조로 재작성. 홈 페이지는 `src/pages/HomePage.tsx` 로 분리.

5. `src/pages/HomePage.tsx` 생성 — 기존 본문을 옮겨넣고, 예시 `/detail` 링크 하나 노출.

6. `pnpm --filter @barreleye/<app-name> typecheck` 로 검증.

## 보일러플레이트 예시

**src/main.tsx**
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

**src/App.tsx**
```tsx
import { Routes, Route } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      {/* 추가 화면: <Route path="/detail/:id" element={<DetailPage />} /> */}
    </Routes>
  );
}
```

## 완료 체크

- [ ] `pnpm --filter @barreleye/<app-name> dev` 로 실행 시 홈 화면이 뜸
- [ ] 브라우저 URL 을 `/` 에서 바꿔도 라우팅이 동작
- [ ] typecheck 통과
