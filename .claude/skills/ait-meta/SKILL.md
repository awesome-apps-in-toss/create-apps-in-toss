---
name: ait-meta
description: 앱의 .meta-dashboard.json을 PRD와 소스코드 분석으로 자동 생성합니다.
allowed-tools: Read, Bash, Glob, Write
mode: automated
requires: []
inputs: []
outputs:
  - { key: metaFile, type: file, path: 'apps/<appName>/.meta-dashboard.json' }
idempotencyKey: ait-meta
---

# .meta-dashboard.json 초기화

앱 소스코드와 PRD를 분석해 `.meta-dashboard.json`을 자동 생성합니다.

## 호출 형식

`/ait-meta` — 앱 폴더 또는 레포 루트에서 실행

## 진행 순서

### STEP 0: 컨텍스트 파악

현재 cwd 확인:

- **`apps/{appName}/` 내부인 경우** → `appDir = apps/{appName}/` 설정 후 STEP 1
- **그 외** → automated 모드에서는 stdin 불가이므로 즉시 ❌ 실패 보고 (reason: `"appDir unresolved — cwd must be apps/<appName>"`)

### STEP 1: PRD 파일 탐색

`appDir` 내에서 아래 패턴으로 순서대로 탐색:

1. `docs/PRD.md`
2. `docs/prd.md`
3. `docs/**/*PRD*.md` (glob)
4. `docs/**/*prd*.md` (glob)
5. `docs/**/*.md` 중 내용에 "문제 정의" 또는 "Problem Statement" 포함된 파일

PRD를 찾으면 STEP 2로 진행. **못 찾으면** 즉시 ❌ 실패 보고 (STEP 2/3 생략):

```
❌ .meta-dashboard.json 생성 실패
원인: PRD 파일을 찾지 못했습니다. 해당 앱의 `docs/` 에 PRD 를 준비한 뒤 다시 실행해 주세요. (appDir=<경로>, 탐색 패턴: docs/PRD.md · docs/prd.md · docs/**/*PRD*.md 등)
```

### STEP 2: 소스코드 분석

읽을 파일과 수집 정보:

- `package.json` → `name`, `description`, `version`
- `granite.config.ts|js` → `appName`, `displayName`, `primaryColor`
- `src/` 최상위 (index.tsx, App.tsx, main.tsx 등) → 앱의 핵심 기능 파악
- PRD 파일 (STEP 1에서 발견) → nameKo, nameEn, subtitle, description, keywords, aitCategory 추론

PRD에서 추론할 정보:

- **nameKo**: PRD 제목/첫 문단
- **nameEn**: PRD 슬로건 또는 package.json name
- **subtitle**: 핵심 가치 제안 10자 내외
- **description**: 문제 정의 + 가치 제안 2-3문장
- **keywords**: 기능/타깃 유저 기반 5개 내외
- **aitCategory**: PRD 내용 기반 추론 (예: "생활 > 콘텐츠 > 테스트")

### STEP 3: .meta-dashboard.json 생성

저장 경로 `{appDir}/.meta-dashboard.json`, 아래 스키마로 생성:

```json
{
  "version": 1,
  "nameKo": "추론된 한국어 이름",
  "nameEn": "Inferred English Name",
  "isGame": false,
  "aitCategory": "추론된 카테고리",
  "subtitle": "한 줄 소개",
  "description": "앱 설명 2-3문장",
  "keywords": ["키워드1", "키워드2", "키워드3"],
  "logoPath": null,
  "thumbnailPath": null,
  "screenshotPaths": [],
  "prdPath": "docs/PRD.md",
  "utPath": null,
  "updatedAt": "현재 시각 (ISO 8601 full datetime, new Date().toISOString() 상당)"
}
```

규칙:

- `prdPath` 는 STEP 1에서 발견한 파일의 `appDir` 기준 상대경로
- `isGame` 기본값 `false` (PRD에서 게임임이 명시된 경우만 `true`)
- `aitCategory` 추론 어려우면 `"생활 > 콘텐츠"` 기본값
- `updatedAt` 예: `"2026-04-24T10:00:00.000Z"`

생성 후 내용을 간단히 요약해서 보여준다.

## 주의사항

- 질문 없이 한 번에 생성 (대시보드에서 수정 가능)
- 이미 `.meta-dashboard.json` 존재 시 automated 모드에서는 덮어쓰지 않고 ❌ 실패 보고 (reason: `"file already exists — run delete first"`). answer 못 받는 automated 에서 hang 방지를 위한 명시적 실패.
- 모든 경로는 `appDir` 기준 상대경로 (절대경로 금지)

## 종료

**성공/실패를 이분법으로 한 번만 처리**하고 세션을 마무리한다.

### 구조화 상태 신호 (NON-NEGOTIABLE)

대시보드 세션으로 실행될 때 환경변수 `AIT_RUN_STATUS_PATH` 로 per-run JSON 파일 경로가 전달된다. **텍스트로 ✅/❌ 를 찍기 전에 반드시** 이 경로에 `Write` 로 기록한다.

성공: `{"status":"success"}`
실패: `{"status":"failure","reason":"<한 줄 원인>"}`

대시보드 밖에서는 환경변수가 비어있을 수 있으니 있을 때만 기록한다.

### ✅ 성공 사용자 보고

```
✅ .meta-dashboard.json 생성: <파일 경로>
추론한 값: nameKo=<...>, aitCategory=<...>, 키워드 <개수>개
```

### ❌ 실패 사용자 보고

```
❌ .meta-dashboard.json 생성 실패
원인: <PRD 미존재 / 대상 앱 식별 불가 / Write 실패 등>
```

**규칙**: 상태 파일 1회 기록 + 보고 1회 후 종료. 이 스킬은 `.meta-dashboard.json` **초기 생성만** 담당 — 이후 필드별 갱신은 `ait-assets`(콘솔 텍스트) / `ait-plan`(PRD 경로) / 서버(이미지·진행도)가 소유하며, 다른 스킬은 건드리지 않는다.
