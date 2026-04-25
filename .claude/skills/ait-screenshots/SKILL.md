---
name: ait-screenshots
description: 구현이 끝난 앱의 dev 서버를 띄워 콘솔 등록용 세로형 스크린샷 3장(636x1048)을 자동 캡처
argument-hint: '[--regenerate]'
mode: interactive
step: 6
label: 스크린샷
produces: 세로형 스크린샷 3장
requires: [ait-implement]
inputs:
  - { key: regenerate, type: boolean, required: false }
outputs:
  - { key: screenshots, type: files, path: 'apps/<appName>/assets/screenshots/*.png' }
idempotencyKey: ait-screenshots
---

# 콘솔 등록용 세로형 스크린샷 캡처

`/ait-implement` 가 끝난 시점에 실행해 실제 dev 서버를 캡처한다.
**이미지 실제 캡처는 `graphic-designer` 에이전트 Section 3 에 위임**하고, SKILL 은 사전 조건 점검·재캡처 판단·에이전트 호출 오케스트레이션만 담당한다.

## 사전 조건

| 항목 | 미충족 시 |
|---|---|
| 앱이 스캐폴딩돼 있음 (`apps/<app-name>/granite.config.ts` 존재) | ❌ 즉시 중단, "/ait-scaffold 부터 실행" 안내 |
| 핵심 화면이 구현돼 있음 (`src/pages/*.tsx` 다수 존재) | ❌ 즉시 중단, "/ait-implement 부터 실행" 안내 |
| dev 서버가 `granite.config.ts` 의 `web.port` 에 떠 있음 | ❌ 사용자에게 기동 명령 전달 후 중단 |

## 실행 절차

1. **앱 디렉토리 확인** — 현재 cwd 가 `apps/<app-name>` 이거나 `$ARGUMENTS` / 사용자 입력으로 앱 결정.

2. **사전 조건 점검** (위 표 기준):
   - `granite.config.ts` 존재 → web.port 추출
   - `src/pages/` 또는 `src/App.tsx` 존재 확인
   - dev 서버 헬스체크:
     ```bash
     curl -s -o /dev/null -w "%{http_code}" "http://localhost:<port>/"
     ```
     `200` 또는 `3xx` 가 아니면 사용자에게 안내 후 중단:
     > dev 서버를 먼저 실행해 주세요: `pnpm --filter @barreleye/<app-name> dev`
     > 서버 기동 후 `/ait-screenshots` 를 다시 실행해주세요.

3. **기존 스크린샷 확인**:
   - `apps/<app-name>/assets/screenshots/*.png` 가 이미 3장 이상이면, `--regenerate` 옵션이 없는 한 사용자에게 재캡처 여부 확인.
   - 재캡처 동의 또는 `--regenerate` → 기존 파일은 같은 이름으로 덮어쓰기.

4. **graphic-designer 에이전트에 캡처 위임** (아래 "에이전트 호출" 참고).

5. **결과 검증**:
   - `assets/screenshots/` 디렉토리에 PNG 가 3장 이상 있는지
   - 각 PNG 가 636x1048 인지 (sharp-cli metadata 또는 file 명령으로 확인)
   - 누락 또는 크기 불일치 시 ❌ 실패 보고

6. **체크리스트 결과를 표로 정리하여 보고**:
   - 생성된 파일 경로 + 캡처한 화면 1줄 요약

## 에이전트 호출 (Task 툴)

```
subagent_type: graphic-designer
description: <app-name> 세로형 스크린샷 3장 캡처
prompt:
  앱: apps/<app-name>
  생성 대상: 세로형 스크린샷 3장 (Section 3 워크플로)
  출력 경로: apps/<app-name>/assets/screenshots/

  규격 (에이전트 문서 Section 3 스펙)
    - 세로 스크린샷: 636x1048 PNG x 3장
    - 파일명: 01-home.png, 02-<핵심플로우>.png, 03-<결과>.png

  화면 선정:
    1) 홈/진입 화면
    2) 핵심 인터랙션 (퀴즈 문항·검색 결과·입력 폼 등)
    3) 결과/완료 화면

  사전조건: dev 서버가 http://localhost:<port>/ 에 떠 있는 상태입니다.
  포트는 granite.config.ts 의 web.port 를 사용해주세요.

  PRD 의 메인 플로우 순서를 따라 화면을 선정하세요.
  민감 정보(전화번호·계좌번호 등) 노출 금지.

  작업 완료 후 캡처한 파일 경로와 각 스크린샷의 화면 요약 1줄을 보고해 주세요.
```

## 예외 처리

- **dev 서버 미기동** → 사용자에게 기동 안내 후 중단 (재실행 권유)
- **에이전트가 3회 반복해도 빈 화면/에러** → 캡처 실패 사유 그대로 사용자에게 보고
- **민감 정보 시드 데이터** → 에이전트가 사용자에게 샘플 데이터 치환 요청 가능

## 종료

**성공/실패를 이분법으로 한 번만 처리** 하고 세션을 마무리한다.
스크린샷은 `apps/<app-name>/assets/screenshots/*.png` 에 저장되고, 대시보드는 이 디렉토리를 자동 스캔해 `.meta-dashboard.json` 의 `screenshotPaths` 에 반영한다 (별도 머지 불필요).

### 구조화 상태 신호 (NON-NEGOTIABLE)

대시보드 세션으로 실행될 때 환경변수 `AIT_RUN_STATUS_PATH` 로 per-run JSON 파일 경로가 전달된다. **텍스트로 ✅/❌ 를 찍기 전에 반드시** 이 경로에 `Write` 로 기록한다. 대시보드는 이 파일만 보고 COMPLETED/FAILED 를 결정한다.

성공:
```json
{"status":"success"}
```

실패:
```json
{"status":"failure","reason":"<한 줄 원인 — 예: dev 서버 미기동 / 에이전트 캡처 3회 실패 / 사이즈 불일치>"}
```

대시보드 밖(터미널 직접 호출)에서는 환경변수가 비어있을 수 있으니 있을 때만 기록한다.

### ✅ 성공 사용자 보고 (상태 파일 기록 이후)

```
✅ 스크린샷 3장 캡처 완료
파일 경로:
  - apps/<app-name>/assets/screenshots/01-home.png      (홈)
  - apps/<app-name>/assets/screenshots/02-<...>.png     (<요약>)
  - apps/<app-name>/assets/screenshots/03-<...>.png     (<요약>)
```

### ❌ 실패 사용자 보고 (상태 파일 기록 이후)

```
❌ 스크린샷 캡처 실패
원인: <구체적 사유 — 예: dev 서버 미기동 / 에이전트 3회 캡처 실패 / 636x1048 사이즈 불일치>
조치: <사용자가 다음 시도할 일 — 예: pnpm --filter @barreleye/<app-name> dev 후 재실행>
```

**규칙**: 상태 파일 1회 기록 + 보고 1회 후 종료. `.meta-dashboard.json` 의 `screenshotPaths` 는 대시보드 서버가 자동 감지하므로 직접 머지하지 않는다.
