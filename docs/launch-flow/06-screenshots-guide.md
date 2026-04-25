# 6단계: 세로형 스크린샷 캡처 (Screenshots)

## 목적

구현이 끝난 실제 앱을 dev 서버에서 띄워서 콘솔 등록용 **세로형 스크린샷 3장 (636x1048px)** 을 캡처한다.
콘솔에 노출되는 우선 자료이므로, 앱의 핵심 사용 흐름 (홈 → 핵심 인터랙션 → 결과) 을 한눈에 보여줘야 한다.

## 사전 조건

| 항목 | 내용 |
|---|---|
| 구현 완료 | `/ait-implement` 가 끝나고 핵심 화면이 모두 동작해야 함 |
| dev 서버 기동 | `granite.config.ts` 의 `web.port` 로 dev 서버가 떠 있어야 함 |
| Puppeteer MCP 또는 capture-website-cli | 헤드리스 캡처 도구. 미설치 시 `npx --yes` 로 1회 다운로드 |

dev 서버 실행:

```bash
pnpm --filter @barreleye/<app-name> dev
```

서버가 정상 응답하는지 확인:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/
```

## 산출물

```
apps/<app-name>/assets/screenshots/
├── 01-home.png            # 홈/인트로 (636x1048)
├── 02-<핵심플로우>.png    # 핵심 상호작용 (636x1048)
└── 03-<결과>.png          # 결과/완료 화면 (636x1048)
```

대시보드는 `assets/screenshots/*.png` 디렉토리를 자동 스캔해 `.meta-dashboard.json` 의 `screenshotPaths` 에 반영한다.

## 화면 선정 가이드

3장은 앱의 핵심 사용 흐름을 순서대로 보여줘야 한다.

| # | 권장 화면 | 예시 |
|---|---|---|
| 1 | 진입 화면 | 홈, 인트로, 시작 버튼 |
| 2 | 핵심 인터랙션 | 입력 폼, 퀴즈 문항, 검색 결과 |
| 3 | 결과 / 완료 | 결과 카드, 추천, 완료 화면 |

피해야 할 상태:
- 빈 화면, 로딩 스피너만 떠 있는 상태
- 에러 상태
- 토스 SDK 브릿지 (navigationBar 등) 가 깨진 상태
- 개인정보·테스트 전화번호·실제 계좌번호 등 민감 정보

## 자동 실행

```bash
/ait-screenshots          # 현재 cwd 가 apps/<app-name> 인 상태에서 실행
```

스킬은 `graphic-designer` 에이전트의 Section 3 워크플로를 호출해 자동 캡처한다.
구체적 캡처 방식·검증 절차는 에이전트 문서 참고.

## 재캡처

UI를 수정하거나 검수 (`/ait-review`) 결과로 화면이 변경되면 다시 실행한다.
`assets/screenshots/` 의 기존 파일은 같은 파일명으로 덮어쓴다.

## 다음 단계

스크린샷이 준비되면 `/ait-review` 로 검수를 진행한다 (또는 검수가 이미 완료됐다면 바로 `/ait-build`).
