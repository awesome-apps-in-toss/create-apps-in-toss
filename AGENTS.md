# Barreleye Agent Guide

> AI 에이전트를 위한 컨텍스트 맵. 상세 내용은 `docs/` 참조.

## Quick Reference

| 작업           | 문서                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| 새 미니앱 생성 | [docs/guides/create-app.md](docs/guides/create-app.md)                           |
| 의존성 추가    | [docs/guides/dependencies.md](docs/guides/dependencies.md)                       |
| 아키텍처 이해  | [docs/architecture/overview.md](docs/architecture/overview.md)                   |
| 의존성 레이어  | [docs/architecture/dependency-layers.md](docs/architecture/dependency-layers.md) |
| 코드 컨벤션    | [docs/conventions/code-style.md](docs/conventions/code-style.md)                 |
| 커밋 규칙      | [docs/conventions/commits.md](docs/conventions/commits.md)                       |
| 에러 해결      | [docs/troubleshooting/common-errors.md](docs/troubleshooting/common-errors.md)   |

## Repository Structure

```
barreleye/
├── apps/           # 미니앱들 (각 앱은 독립 배포 단위)
├── packages/       # 공유 패키지 (tsconfig, eslint-config, ui)
├── docs/           # 상세 문서 (이 파일의 상세 버전)
└── scripts/        # 유틸리티 스크립트
```

## Dependency Flow (STRICT)

```
packages/tsconfig → packages/eslint-config → packages/ui → apps/*
```

- `apps/*`는 `packages/*`에 의존 가능
- `packages/*`는 서로 의존 가능 (순환 금지)
- `apps/*`끼리는 의존 금지

## Commands

```bash
pnpm dev          # 개발 서버
pnpm build        # 프로덕션 빌드
pnpm typecheck    # 타입 검사
pnpm lint         # 린트
pnpm format       # 포맷팅
pnpm new-app X    # 새 앱 생성
```

## Tech Stack

- **Runtime**: React 18, TypeScript 5.6
- **Build**: Vite 6, Turborepo
- **State**: TanStack Query (서버), Zustand (클라이언트, 선택)
- **Routing**: React Router v7
- **앱인토스**: @apps-in-toss/web-framework ^1.x, @toss/tds-mobile ^2.x

## Constraints

1. **TDS 필수**: 비게임 미니앱은 @toss/tds-mobile 컴포넌트 사용 필수
2. **SDK 버전**: 2026년 3월 23일 이후 SDK 1.x 업로드 불가
3. **Path Alias**: `@/` prefix로 src 내부 import
4. **No Default Export**: 컴포넌트는 named export 권장

## When Stuck

1. [docs/troubleshooting/](docs/troubleshooting/) 확인
2. `pnpm typecheck` 에러 메시지 확인
3. 앱인토스 문서: https://developers-apps-in-toss.toss.im
