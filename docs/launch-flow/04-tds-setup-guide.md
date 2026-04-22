# 4단계: TDS 세팅 (TDS Setup Guide)

## 목적

Toss Design System(TDS)을 설치하고 정상 동작을 검증한다.

## 필수 요건

- **비게임 미니앱은 TDS 사용이 필수**
- 게임 미니앱은 게임 전용 UI 사용 가능 (TDS 선택)

## 패키지 정보

| 프레임워크 버전                        | 패키지                       |
| -------------------------------------- | ---------------------------- |
| `@apps-in-toss/web-framework` >= 1.0.0 | `@toss/tds-mobile`           |
| `@apps-in-toss/web-framework` < 1.0.0  | `@toss-design-system/mobile` |

이 레포는 SDK ^2.x 기준이므로 `@toss/tds-mobile` ^2.x 사용.

## 필수 패키지 (3+1개)

`package.json`에 아래 패키지가 포함되어 있어야 함:

```json
{
  "dependencies": {
    "@toss/tds-mobile": "^2.0.0",
    "@toss/tds-mobile-ait": "^2.0.0",
    "@emotion/react": "^11.0.0",
    "@toss/tds-colors": "^2.0.0"
  }
}
```

| 패키지                 | 역할                                              | 필수 |
| ---------------------- | ------------------------------------------------- | ---- |
| `@toss/tds-mobile`     | TDS 컴포넌트 라이브러리                           | 필수 |
| `@toss/tds-mobile-ait` | 앱인토스 전용 Provider (`TDSMobileAITProvider`)   | 필수 |
| `@emotion/react`       | TDS 스타일 엔진 의존성                            | 필수 |
| `@toss/tds-colors`     | adaptive 색상 시스템 (라이트/다크 모드 자동 대응) | 권장 |

> `pnpm new-app` 은 최소 스캐폴딩만 만든다 (TDS 포함 X). 이 스킬이 **유일한 TDS 설치 경로**다.
> `/ait-scaffold` 대화형 단계에서 "토스 스타일 UI" 를 승인했다면 이미 설치되어 있을 수 있으니, `package.json` 을 먼저 확인하고 누락된 것만 추가한다.

설치 커맨드:

```bash
pnpm --filter @barreleye/<app-name> add @toss/tds-mobile @toss/tds-mobile-ait @emotion/react @toss/tds-colors
```

### adaptive 색상 시스템

`@toss/tds-colors`의 `adaptive` 객체는 라이트/다크 모드에 자동 대응하는 색상을 제공한다:

```tsx
import { adaptive } from '@toss/tds-colors';

// 사용 예시
<div style={{ color: adaptive.grey900, backgroundColor: adaptive.grey50 }}>텍스트</div>;
```

주요 색상: `adaptive.grey50`~`adaptive.grey900`, `adaptive.blue50`~`adaptive.blue600` 등

## TDSMobileAITProvider 래핑 (필수)

App 컴포넌트 최상위를 `TDSMobileAITProvider`로 감싸야 TDS 컴포넌트가 정상 동작한다:

```tsx
// src/App.tsx
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';

export function App() {
  return <TDSMobileAITProvider>{/* 라우터, 페이지 등 */}</TDSMobileAITProvider>;
}
```

> `/ait-tds-setup` 스킬이 `App.tsx` 를 자동으로 Provider 래핑한다. 수동 설치했다면 직접 추가 필요.

## TDS 컴포넌트 사용법

TDS Web 문서 참고: https://tossmini-docs.toss.im/tds-mobile/

### MCP로 TDS 문서 검색

```
mcp__apps-in-toss__search_tds_web_docs({ query: "Button" })
mcp__apps-in-toss__get_tds_web_doc({ id: "<doc-id>" })
```

### 주요 컴포넌트 카테고리

- **Layout**: Box, Flex, Stack, Spacer
- **Typography**: Text, Heading
- **Input**: TextField, TextArea, Checkbox, Radio, Switch, Select
- **Button**: Button, IconButton, LinkButton
- **Feedback**: Toast, Dialog, BottomSheet, Snackbar
- **Navigation**: Tabs, Chip
- **Data Display**: Badge, Avatar, Card, List

## TDS 주의사항

1. **로컬 브라우저에서는 TDS가 동작하지 않음** - 반드시 샌드박스 앱으로 테스트
2. **라이트 모드 테마 구현 필수** (비게임)
3. TDS 컴포넌트의 `primaryColor`는 `granite.config.ts`의 `brand.primaryColor` 값을 따름
4. 색 대비 기준 미충족 시 자동 보정될 수 있음

## TDS 세팅 검증 체크리스트

- [ ] `@toss/tds-mobile`, `@toss/tds-mobile-ait`, `@emotion/react` 3개 패키지 설치 확인
- [ ] `TDSMobileAITProvider`로 App 래핑 확인
- [ ] 최소 1개 이상의 TDS 컴포넌트 import 및 렌더링 테스트
- [ ] `@toss/tds-colors` 설치 및 adaptive 색상 활용 (권장)
- [ ] `granite.config.ts`의 `brand.primaryColor` 설정
- [ ] 빌드 에러 없이 정상 컴파일 확인 (`pnpm --filter @barreleye/<app-name> typecheck`)
- [ ] (가능하다면) 샌드박스 앱에서 TDS 렌더링 확인

## TDS LLM 문서

에이전트가 TDS 컴포넌트를 검색/참고할 때:

- TDS WebView 전체 문서: `https://tossmini-docs.toss.im/tds-mobile/llms-full.txt`
- MCP: `search_tds_web_docs` → `get_tds_web_doc`
