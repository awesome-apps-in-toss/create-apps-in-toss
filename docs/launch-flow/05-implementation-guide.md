# 5단계: 구현 (Implementation Guide)

## 목적

기획서를 기반으로 앱 기능을 구현한다. 병렬 에이전트를 활용하여 효율적으로 개발한다.

## 구현 전 준비

1. `apps/<app-name>/docs/planning.md` 기획서 확인
2. granite.config.ts 설정 완료 확인
3. TDS 세팅 완료 확인
4. 필요한 SDK 기능 목록 정리

## 라우팅 (React Router)

이 레포는 `react-router-dom` v7을 사용한다. 스캐폴드는 단일 라우트(`/`)만 생성하므로 멀티 페이지 앱은 직접 라우트를 추가해야 한다.

### 라우트 정의

```tsx
// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { HomePage } from '@/pages/HomePage';
import { DetailPage } from '@/pages/DetailPage';
import { ResultPage } from '@/pages/ResultPage';

export function App() {
  return (
    <TDSMobileAITProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/detail/:id" element={<DetailPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TDSMobileAITProvider>
  );
}
```

### 페이지 간 데이터 전달

```tsx
// URL 파라미터 (경로에 포함)
import { useParams } from 'react-router-dom';
const { id } = useParams<{ id: string }>();

// 쿼리 파라미터 (선택적 데이터)
import { useSearchParams } from 'react-router-dom';
const [searchParams] = useSearchParams();
const value = searchParams.get('key');

// 네비게이션
import { useNavigate } from 'react-router-dom';
const navigate = useNavigate();
navigate('/result?score=100');
navigate(-1); // 뒤로가기
```

### 잘못된 파라미터 처리

```tsx
// 필수 파라미터가 없으면 홈으로 리다이렉트
const { id } = useParams<{ id: string }>();
if (!id) return <Navigate to="/" replace />;
```

> `BrowserRouter`는 `main.tsx`에 이미 설정되어 있음 (스캐폴드 기본 포함)

## SDK 기능 참조

### 핵심 기능 (비게임/게임 공통)

| 기능          | SDK 함수                               | import 경로                             |
| ------------- | -------------------------------------- | --------------------------------------- |
| 공통 설정     | `granite.config.ts`                    | -                                       |
| 내비게이션 바 | 공통 설정으로 자동 표시                | -                                       |
| 토스 로그인   | `appLogin()`                           | `@apps-in-toss/web-framework`           |
| 클립보드      | `getClipboardText`, `setClipboardText` | `@apps-in-toss/web-framework`           |
| 공유 링크     | `getTossShareLink`, `share`            | `@apps-in-toss/web-framework`           |
| 분석 초기화   | `init`                                 | `@apps-in-toss/web-framework` 분석 모듈 |
| 화면 방향     | `setDeviceOrientation`                 | `@apps-in-toss/web-framework`           |
| 리뷰 요청     | `requestReview`                        | `@apps-in-toss/web-framework`           |

### 수익화 기능

| 기능      | SDK 함수                                                              | import 경로                   | 사전 요건              |
| --------- | --------------------------------------------------------------------- | ----------------------------- | ---------------------- |
| 인앱 결제 | `IAP.createOneTimePurchaseOrder()` 등                                 | `@apps-in-toss/web-framework` | 사업자 등록            |
| 토스페이  | `TossPay.checkoutPayment()`                                           | `@apps-in-toss/web-framework` | 사업자 등록            |
| 인앱 광고 | `loadFullScreenAd` / `showFullScreenAd`, 배너: `TossAds.attachBanner` | `@apps-in-toss/web-framework` | 사업자 등록            |
| 프로모션  | 리워드 지급 API                                                       | `@apps-in-toss/web-framework` | 사업자 등록 + 비즈월렛 |

> 각 함수의 상세 시그니처/사용법은 MCP `search_docs`로 검색하여 확인

### SDK 함수 가드 패턴 (`.isSupported()`)

SDK 함수는 토스앱 샌드박스 밖(로컬 브라우저)에서는 동작하지 않는다. **반드시 `.isSupported()` 체크 후 호출**해야 개발 중 크래시를 방지한다:

```tsx
import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

// 광고 로딩 (사전 로딩 필수)
if (loadFullScreenAd.isSupported()) {
  await loadFullScreenAd({ adUnitId: 'AD_UNIT_ID', type: 'interstitial' });
}

// 광고 표시
if (showFullScreenAd.isSupported()) {
  await showFullScreenAd({ adUnitId: 'AD_UNIT_ID' });
}
```

### 에러 핸들링 & 폴백 패턴

SDK 호출 실패에 대비한 폴백 체인을 구현:

```tsx
// SDK 호출 폴백 체인: SDK → Web API → 클립보드 순으로 시도
async function shareContent(url: string, text: string) {
  if (share.isSupported()) return share({ url, text });
  if (navigator.share) return navigator.share({ url, text });
  if (navigator.clipboard) await navigator.clipboard.writeText(url);
}
```

### 서버 API 연동 (필요 시)

- mTLS 인증서 설정 필요
- 방화벽 Inbound/Outbound 설정 필요
- 도메인: `apps-in-toss-api.toss.im` (로그인/메시지), `pay-apps-in-toss-api.toss.im` (결제)
- 요청 제한: 분당 3,000 QPM

## 구현 시 필수 준수사항

> 상세 UX/디자인 규칙은 `06-review-checklist.md`를 참고. 구현 중 특히 주의할 핵심 항목만 아래에 기재.

- Safe Area 영역 침범 금지
- 자사 앱/서비스 설치 유도 금지
- 라이트 모드 테마 구현

## 디렉토리 구조 규칙

```
src/
├── pages/       # 라우트 컴포넌트 (페이지당 1파일)
├── components/  # 재사용 컴포넌트
├── utils/       # 순수 함수, 헬퍼
├── types/       # TypeScript 타입 정의
└── providers/   # Context Provider (QueryProvider 등)
```

- `@/` 경로 별칭 사용 가능 (tsconfig paths + vite-tsconfig-paths 설정됨)
- 예: `import { CostInputForm } from '@/components/CostInputForm'`

## 스타일링

- **TDS 컴포넌트 + inline style 우선** (커스텀 CSS 최소화)
- `@toss/tds-colors`의 `adaptive` 색상으로 라이트/다크 모드 대응
- 스캐폴드에 포함된 `index.css`는 초기 스타일이며, TDS 도입 후 불필요한 부분은 제거

## TDS 주요 컴포넌트 사용 예시

실제 앱에서 자주 사용하는 TDS 패턴:

### 페이지 헤더 (Top)

```tsx
import { Top } from '@toss/tds-mobile';

<Top
  title={<Top.TitleParagraph size={22}>페이지 제목</Top.TitleParagraph>}
  subtitle={<Top.SubtitleParagraph>설명 텍스트</Top.SubtitleParagraph>}
/>;
```

### 리스트 (ListRow)

```tsx
import { ListRow } from '@toss/tds-mobile';
import { adaptive } from '@toss/tds-colors';

<ListRow
  arrowType="right"
  left={<div style={{ padding: 8, borderRadius: 8, backgroundColor: adaptive.blue50 }}>아이콘</div>}
  contents={<ListRow.Texts title="항목 제목" description="설명" />}
  onClick={() => navigate('/detail')}
/>;
```

### 입력 폼 (TextField)

```tsx
import { TextField } from '@toss/tds-mobile';

<TextField label="라벨" value={value} onChange={setValue} placeholder="입력해주세요" />;
```

### 하단 버튼 (CTAButton)

```tsx
import { CTAButton } from '@toss/tds-mobile';

<CTAButton size="large" onClick={handleSubmit}>
  계산하기
</CTAButton>;
```

> MCP `search_tds_web_docs`로 추가 컴포넌트 검색 가능

## 에이전트 병렬 구현 전략

복잡한 앱은 2단계로 분할 실행:

### Phase 1: 공유 기반 구조 (순차)

먼저 아래를 생성한다:

- `types/` — 공유 타입 정의
- `App.tsx` — 라우팅 골격
- `utils/` — 공유 유틸리티 스텁

### Phase 2: 기능별 병렬 구현

Phase 1 완료 후 에이전트를 분할 실행:

```
Agent 1: 핵심 기능 A 페이지
Agent 2: 핵심 기능 B 페이지
Agent 3: 핵심 기능 C 페이지
```

각 에이전트에 전달할 컨텍스트:

- 기획서 (`apps/<app-name>/docs/planning.md`)
- granite.config.ts 설정 내용
- **공유 타입/인터페이스** (`types/` 디렉토리)
- TDS 컴포넌트 사용 가이드
- 이 구현 가이드 (`05-implementation-guide.md`)

## 병렬 에이전트 공유 패턴

Phase 1에서 아래 공유 패턴을 먼저 정의하면 Phase 2 에이전트 간 일관성이 보장됨:

### 공유 패턴 템플릿

```tsx
// types/index.ts — 공유 타입을 한 곳에 정의
export interface AppState { ... }

// utils/format.ts — 공유 포맷 함수
export function formatCurrency(amount: number): string { ... }

// hooks/useAppState.ts — 공유 상태 훅 (필요 시)
export function useAppState() { ... }
```

Phase 2 에이전트 규칙:

- `types/`의 타입만 사용, 페이지 내 ad-hoc 타입 금지
- TDS 컴포넌트 동일 패턴 사용 (Top → ListRow → CTAButton)
- 에러 처리: try-catch + console.warn 통일
- adaptive 색상만 사용 (하드코딩 HEX 금지)

## MCP 문서 검색 활용

구현 중 SDK/TDS 사용법이 필요할 때:

```
# SDK 기능 검색
mcp__apps-in-toss__search_docs({ query: "인앱 결제" })

# TDS 컴포넌트 검색
mcp__apps-in-toss__search_tds_web_docs({ query: "BottomSheet" })

# 문서 상세 조회
mcp__apps-in-toss__get_doc({ id: "<doc-id>" })
```

## 참고 링크

- SDK 레퍼런스 전체: https://developers-apps-in-toss.toss.im/bedrock/reference/framework/시작하기/overview.html
- 권한 설정: https://developers-apps-in-toss.toss.im/bedrock/reference/framework/권한/permission.html
- API 개요: https://developers-apps-in-toss.toss.im/api/overview.html
- Sentry 설정: https://developers-apps-in-toss.toss.im/learn-more/sentry-monitoring.html
