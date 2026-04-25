# 앱인토스 미니앱 출시 플로우 개요

> 이 문서는 앱인토스(Apps in Toss) 미니앱을 아이디어 단계부터 출시 직전까지 준비하는 전체 플로우를 정의합니다.

## 전체 플로우 (8단계)

```
1. 기획 (Plan)             ─ 아이디어 정의, 정책 검토, 기획서 작성
2. 리소스 준비 (Prepare)   ─ 로고·가로 썸네일·콘솔 텍스트 리소스 점검
3. 스캐폴딩 (Scaffold)     ─ pnpm new-app으로 프로젝트 생성 및 설정
4. TDS 세팅 (TDS Setup)    ─ TDS 환경 구성 및 검증
5. 구현 (Implement)        ─ 기능 개발 (병렬 에이전트 활용 가능)
6. 스크린샷 (Screenshots)  ─ dev 서버 기동 후 세로형 스크린샷 3장 캡처
7. 검수 (Review)           ─ 체크리스트 기반 리뷰 및 QA
8. 빌드 & 배포 준비 (Build) ─ 빌드 테스트, 번들 검증, 배포 준비
```

## 단계별 상세 문서

| 단계           | 문서                                                     | 슬래시 커맨드      |
| -------------- | -------------------------------------------------------- | ------------------ |
| 1. 기획        | [01-planning-guide.md](01-planning-guide.md)             | `/ait-plan`        |
| 2. 리소스 준비 | [02-resource-checklist.md](02-resource-checklist.md)     | `/ait-assets`      |
| 3. 스캐폴딩    | [03-scaffold-guide.md](03-scaffold-guide.md)             | `/ait-scaffold`    |
| 4. TDS 세팅    | [04-tds-setup-guide.md](04-tds-setup-guide.md)           | `/ait-tds-setup`   |
| 5. 구현        | [05-implementation-guide.md](05-implementation-guide.md) | `/ait-implement`   |
| 6. 스크린샷    | [06-screenshots-guide.md](06-screenshots-guide.md)       | `/ait-screenshots` |
| 7. 검수        | [07-review-checklist.md](07-review-checklist.md)         | `/ait-review`      |
| 8. 빌드 & 배포 | [08-build-deploy-guide.md](08-build-deploy-guide.md)     | `/ait-build`       |

## 오케스트레이션 커맨드

- `/ait-launch` : 전체 플로우를 단계별로 순차 실행하는 메인 커맨드

## 주요 외부 참고 자료

| 자료                 | URL                                                            |
| -------------------- | -------------------------------------------------------------- |
| 앱인토스 개발자 센터 | https://developers-apps-in-toss.toss.im/                       |
| LLM용 전체 문서      | https://developers-apps-in-toss.toss.im/llms-full.txt          |
| TDS WebView 문서     | https://tossmini-docs.toss.im/tds-mobile/llms-full.txt         |
| 앱인토스 콘솔        | https://apps-in-toss.toss.im/                                  |
| MCP 서버             | `apps-in-toss` MCP (search_docs, get_doc, search_tds_web_docs) |

## 기술 스택 (이 레포 기준)

- **Runtime**: React 18, TypeScript 5.6
- **Build**: Vite 6, Turborepo
- **앱인토스 SDK**: @apps-in-toss/web-framework ^2.x
- **TDS**: @toss/tds-mobile ^2.x
- **State**: TanStack Query (서버), Zustand (클라이언트, 선택)
- **Routing**: React Router v7
