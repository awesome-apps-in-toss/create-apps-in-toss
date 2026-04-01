# Barreleye

앱인토스 미니앱 개발을 위한 모노레포입니다.

## 기술 스택

- **모노레포**: pnpm workspaces + Turborepo
- **빌드 도구**: Vite 6
- **프레임워크**: React 18 + TypeScript 5.6
- **상태 관리**: TanStack Query v5
- **라우팅**: React Router v7
- **앱인토스 SDK**: @apps-in-toss/web-framework ^1.x
- **디자인 시스템**: @toss/tds-mobile ^2.x

## 시작하기

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm dev

# 빌드
pnpm build
```

## 주요 명령어

| 명령어                | 설명                   |
| --------------------- | ---------------------- |
| `pnpm dev`            | 모든 앱 개발 서버 실행 |
| `pnpm build`          | 전체 빌드              |
| `pnpm lint`           | 전체 린트 검사         |
| `pnpm typecheck`      | 전체 타입 체크         |
| `pnpm format`         | 코드 포맷팅            |
| `pnpm new-app <name>` | 새 미니앱 생성         |

## 프로젝트 구조

```
barreleye/
├── apps/                    # 미니앱들
│   └── sample-miniapp/      # 샘플 앱
├── packages/                # 공유 패키지
│   ├── tsconfig/            # TypeScript 설정
│   ├── eslint-config/       # ESLint 설정
│   └── ui/                  # 공유 UI 컴포넌트
├── docs/                    # 문서 (Harness)
├── scripts/                 # 유틸리티 스크립트
├── AGENTS.md                # AI 에이전트 가이드
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## 문서

상세 문서는 `docs/` 디렉토리 참조:

- [Architecture Overview](docs/architecture/overview.md)
- [Dependency Layers](docs/architecture/dependency-layers.md)
- [Create App Guide](docs/guides/create-app.md)
- [Code Style](docs/conventions/code-style.md)
- [Troubleshooting](docs/troubleshooting/common-errors.md)

AI 에이전트용 컨텍스트: [AGENTS.md](AGENTS.md)

## 새 미니앱 생성

```bash
pnpm new-app my-new-app
pnpm install
pnpm --filter @barreleye/my-new-app dev
```

## 주의사항

- SDK 2.x 필수 (2026년 3월 23일 이후 1.x 업로드 불가)
- TDS 컴포넌트는 샌드박스 앱에서만 테스트 가능
- 비게임 미니앱은 TDS 사용 필수
