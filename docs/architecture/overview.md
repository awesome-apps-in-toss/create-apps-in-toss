# Architecture Overview

## 모노레포 구조

```
barreleye/
├── apps/                    # 배포 단위 (미니앱들)
│   └── sample-miniapp/
│       ├── src/
│       │   ├── pages/       # 페이지 컴포넌트
│       │   ├── providers/   # Context/Provider
│       │   ├── components/  # 앱 전용 컴포넌트
│       │   ├── hooks/       # 커스텀 훅
│       │   ├── utils/       # 유틸리티
│       │   └── types/       # 타입 정의
│       ├── granite.config.ts
│       └── vite.config.ts
│
├── packages/                # 공유 코드
│   ├── tsconfig/           # TS 설정 공유
│   ├── eslint-config/      # ESLint 규칙 공유
│   └── ui/                 # 공유 UI 컴포넌트
│
├── docs/                   # 문서 (Harness)
└── scripts/                # CLI 도구
```

## 레이어 구조

각 앱 내부는 다음 레이어 순서를 따릅니다:

```
types → utils → hooks → components → pages → App
```

- **types**: 타입 정의만 (런타임 코드 없음)
- **utils**: 순수 함수, 헬퍼
- **hooks**: 커스텀 훅 (상태 로직)
- **components**: 재사용 UI 컴포넌트
- **pages**: 라우트 단위 페이지
- **App**: 라우터, 프로바이더 조합

## 의존성 규칙

### 허용되는 의존성

```
apps/* → packages/*     ✅
packages/ui → packages/tsconfig     ✅
packages/eslint-config → packages/tsconfig     ✅ (간접)
```

### 금지되는 의존성

```
apps/a → apps/b     ❌ (앱 간 의존 금지)
packages/* → apps/*     ❌ (역방향 금지)
순환 의존성     ❌
```

## 빌드 순서

Turborepo가 의존성 그래프에 따라 자동 결정:

```
1. packages/tsconfig (의존성 없음)
2. packages/eslint-config (tsconfig 필요)
3. packages/ui (tsconfig, eslint-config 필요)
4. apps/* (모든 packages 필요)
```
