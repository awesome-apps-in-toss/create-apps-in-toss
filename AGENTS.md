# Barreleye Agent Guide

> AI 에이전트를 위한 컨텍스트 맵. 이 파일만으로 프로젝트 전체를 파악하고, 상세 내용은 `docs/` 참조.

## Quick Reference

| 작업 | 문서 | 스킬 |
|------|------|------|
| 새 앱 전체 플로우 | `docs/launch-flow/00-overview.md` | `/ait-launch` |
| 아이디어 → PRD | `docs/launch-flow/01-planning-guide.md` | `/ait-plan` |
| 리소스 준비 | `docs/launch-flow/02-resource-checklist.md` | `/ait-assets` |
| 스캐폴딩 | `docs/launch-flow/03-scaffold-guide.md` | `/ait-scaffold` |
| TDS 세팅 | `docs/launch-flow/04-tds-setup-guide.md` | `/ait-tds-setup` |
| 구현 | `docs/launch-flow/05-implementation-guide.md` | `/ait-implement` |
| 검수 | `docs/launch-flow/06-review-checklist.md` | `/ait-review` |
| 빌드 & 배포 | `docs/launch-flow/07-build-deploy-guide.md` | `/ait-build` |
| UT 시뮬레이션 | — | `/ait-ut` |
| 앱 메타 생성 | — | `/ait-meta` |
| 아키텍처 이해 | `docs/architecture/overview.md` | — |
| 의존성 관리 | `docs/guides/dependencies.md` | — |
| 코드 컨벤션 | `docs/conventions/code-style.md` | — |
| 커밋 규칙 | `docs/conventions/commits.md` | — |
| 에러 해결 | `docs/troubleshooting/common-errors.md` | — |

---

## 앱인토스 출시 파이프라인 (7단계)

```
/ait-plan → /ait-assets → /ait-scaffold → /ait-tds-setup → /ait-implement → /ait-review → /ait-build
     ↑                                                                                              ↑
  정책검토 포함                                                                              콘솔 업로드 안내
```

`/ait-launch` 를 사용하면 7단계를 순차적으로 실행한다.

---

## Repository Structure

```
barreleye/
├── apps/                    # 사용자 미니앱 (scaffold 시 비어있음, update-template 불가침)
│   └── sample/              # 샘플 미니앱 (upstream branch에만 존재, scaffold 시 제거됨)
├── packages/                # 사용자 공용 패키지
│   ├── tsconfig/            # 공유 TypeScript 설정
│   ├── eslint-config/       # 공유 ESLint 설정
│   └── ui/                  # 공유 UI 컴포넌트
├── internal/                # 템플릿 관리 영역 (update-template 동기화 대상)
│   ├── dashboard/           # 관리 대시보드
│   └── create-apps-in-toss/ # 스캐폴더 패키지 (upstream 전용, scaffold 시 제거됨)
├── docs/
│   ├── launch-flow/        # 앱인토스 7단계 출시 플로우
│   ├── architecture/       # 아키텍처 (overview, dependency-layers)
│   ├── conventions/        # 코드 컨벤션 (code-style, commits)
│   ├── guides/             # 기술 가이드 (create-app, dependencies)
│   └── troubleshooting/    # 에러 해결
├── .claude/
│   ├── mcp.json            # MCP 서버 설정 (puppeteer, openai-image)
│   ├── agents/
│   │   └── graphic-designer.md
│   └── skills/             # Claude 스킬 (10개)
│       ├── ait-plan/           # 아이디어→정책검토→PRD
│       ├── ait-meta/           # .meta-dashboard.json 자동 생성
│       ├── ait-assets/         # 이미지/텍스트 리소스 생성
│       ├── ait-scaffold/       # 스캐폴딩
│       ├── ait-tds-setup/      # TDS 환경 세팅
│       ├── ait-implement/      # 기능 구현
│       ├── ait-review/         # 검수 체크리스트
│       ├── ait-build/          # 빌드 & 배포
│       ├── ait-launch/         # 전체 플로우 오케스트레이터
│       └── ait-ut/             # UT 시뮬레이션
└── scripts/                # 유틸리티 스크립트 (create-app.js)
```

## Dependency Flow (엄격)

```
packages/tsconfig → packages/eslint-config → packages/ui → apps/* ∪ internal/*
```

- `apps/*` / `internal/*`는 `packages/*`에 의존 가능
- `packages/*`는 서로 의존 가능 (순환 금지)
- `apps/*`끼리는 의존 금지
- `internal/*`은 템플릿 관리 영역 — `update-template` 동기화 대상

---

## Tech Stack

| 영역 | 기술 |
|------|------|
| Runtime | React 18, TypeScript 5.6 |
| Build | Vite 6, Turborepo |
| State | TanStack Query (서버), Zustand (클라이언트, 선택) |
| Routing | React Router v7 |
| 앱인토스 | `@apps-in-toss/web-framework` ^2.x, `@toss/tds-mobile` ^2.x |
| Dashboard | Express + SSE + chokidar |

---

## Commands

```bash
pnpm dev          # 대시보드 개발 서버 (포트 3000 + API 3001)
pnpm dev:apps     # 대시보드 제외 앱 개발 서버
pnpm build        # 프로덕션 빌드
pnpm typecheck    # 타입 검사
pnpm lint         # 린트
pnpm format       # 포맷팅
pnpm new-app X    # 새 앱 생성
```

---

## Dashboard

`internal/dashboard/`는 로컬 웹 UI로 다음 기능을 제공한다:

- 모든 앱과 완료 상태(3 레이어) 시각화
- `.meta-dashboard.json` 메타데이터 인라인 편집
- 스킬 트리거 (PRD 생성, UT, 에셋 생성, 전체 파이프라인)
- SSE 기반 실시간 파일 감시

실행: `pnpm dev` (대시보드 포트 3000, API 서버 포트 3001)

---

## Agents & MCP

| 이름 | 역할 |
|------|------|
| `graphic-designer` 에이전트 | 앱 에셋 생성 (로고, 썸네일, 스크린샷) |
| `puppeteer` MCP | HTML → PNG 캡처 |
| `openai-image` MCP | DALL-E 이미지 생성 |

설정 파일: `.claude/mcp.json`

---

## Constraints

1. **TDS 필수**: 비게임 미니앱은 `@toss/tds-mobile` 컴포넌트 사용 필수
2. **SDK 버전**: 2026년 3월 23일 이후 SDK 1.x 업로드 불가 (`@apps-in-toss/web-framework` ^2.x 사용)
3. **Path Alias**: `@/` prefix로 `src` 내부 import
4. **No Default Export**: 컴포넌트는 named export 권장

---

## When Stuck

1. `docs/troubleshooting/common-errors.md` 확인
2. `pnpm typecheck` 에러 메시지 확인
3. 앱인토스 문서: https://developers-apps-in-toss.toss.im
