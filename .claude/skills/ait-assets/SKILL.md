---
name: ait-assets
description: 앱인토스 콘솔 등록에 필요한 이미지(로고/썸네일 SVG+PNG)/텍스트 리소스를 점검하고, 이미지 자동 생성 옵션 제공
argument-hint: '[앱 유형: game|partner] [--generate-images]'
mode: interactive
step: 2
label: 에셋
produces: 로고, 썸네일, 스크린샷
requires: []
inputs:
  - { key: appType, type: enum, values: [game, partner], required: false }
  - { key: generateImages, type: boolean, required: false }
outputs:
  - { key: images, type: files, path: 'apps/*/assets/*.{svg,png}' }
idempotencyKey: ait-assets
---

# 앱인토스 리소스 준비 점검

콘솔 등록에 필요한 이미지/텍스트 리소스를 점검하고 미비 사항을 안내합니다.
**이미지 실제 생성은 `graphic-designer` 에이전트에 위임**하고, SKILL은 체크리스트 점검·텍스트 규칙 검증·에이전트 호출 오케스트레이션만 담당합니다.

## 실행 절차

1. **`docs/launch-flow/02-resource-checklist.md`를 읽어서 전체 리소스 목록을 확인**합니다.

2. 사용자에게 현재 준비 상태를 확인합니다 (`$ARGUMENTS`에 앱 유형이 있으면 자동 인식):
   - 문서의 전체 리소스 목록(이미지/텍스트/게임 추가 항목)을 기준으로 점검
   - **텍스트 입력 시 특수문자 제한 검증**: `:`, `∙`, `?` 만 허용, 이모지 사용 불가
   - **상세 설명**은 AI 마케팅 소재 자동 생성에 쓰이므로 `docs/launch-flow/02-resource-checklist.md` 의 예시를 따른다

3. 각 항목의 규격/규칙 준수 여부를 검증합니다 (상세 규격: 문서 참고).

4. **이미지 리소스 미비 시 `graphic-designer` 에이전트에 생성 위임** (아래 "이미지 생성 위임" 섹션 참고):
   - 이미지가 없거나 `--generate-images` 옵션이 있으면 생성 여부를 사용자에게 확인
   - 동의 시 Task 툴로 `graphic-designer` 에이전트 호출
   - 에이전트가 자율적으로 로고·썸네일을 생성하고 결과 경로를 보고
   - 결과를 사용자에게 전달, 수정 요청이 있으면 에이전트에 재위임

5. **콘솔 등록용 텍스트 필드를 `.meta-dashboard.json`에 반영**합니다 (아래 "콘솔 텍스트 필드 반영" 섹션 참고).

6. 체크리스트 결과를 표로 정리하여 보고합니다:
   - 준비 완료 / 미비 / 이미지 생성됨 / 해당 없음

---

## 텍스트 입력 규칙

모든 텍스트 입력 필드 공통: 허용 특수문자는 `:`, `∙`, `?` 뿐이며 이모지·그 외 특수문자(`!@#$%&*` 등) 금지.

## 이미지 생성 위임

이미지 리소스(로고·정방형 썸네일·가로형 썸네일)는 **`graphic-designer` 에이전트**가 생성합니다. 생성 방식·스타일·제약·워크플로 등 디테일은 `.claude/agents/graphic-designer.md` 에 정의되어 있어 SKILL 에서 중복 기술하지 않습니다.

### 에이전트 호출 (Task 툴)

```
subagent_type: graphic-designer
description: <app-name> 에셋 생성
prompt:
  앱: apps/<app-name>
  생성 대상: 로고, 정방형 썸네일, 가로형 썸네일
  출력 경로: apps/<app-name>/assets/

  규격 (에이전트 문서의 스펙 표를 따름)
    - 로고: 600x600 PNG + SVG 원본
    - 정방형 썸네일: 1000x1000 PNG + HTML 원본
    - 가로형 썸네일: 1932x828 PNG + HTML 원본

  브랜드: granite.config.ts의 brand.primaryColor 사용
  PRD: apps/<app-name>/docs/PRD.md 참고

  작업 완료 후 생성된 파일 경로와 디자인 컨셉 1줄 요약을 보고해 주세요.
```

### 생성 결과 파일 구조

```
apps/<app-name>/assets/
├── _sources/
│   ├── logo.svg
│   ├── thumbnail-square.html
│   └── thumbnail-wide.html
├── logo.png              # 600x600
├── thumbnail-square.png  # 1000x1000
└── thumbnail-wide.png    # 1932x828
```

### 예외 처리

에이전트가 아래 경우 자율 실행을 중단하고 되돌아올 수 있습니다 — 사용자에게 전달해 협의:

- **PRD 부족**으로 서비스 본질 추론 불가 → 에이전트가 필요 정보를 구체적으로 질문
- **3회 반복해도 일반성 검증 통과 실패** → 시도한 후보와 탈락 이유를 받아 방향성 상담

## 콘솔 텍스트 필드 반영

대시보드의 **스토어 등록 자료** 카드는 `apps/<app-name>/.meta-dashboard.json` 필드를 읽어 표시합니다. 이미지 경로(`logoPath`, `thumbnailPath`, `screenshotPaths`)는 `assets/` 파일 존재로 서버가 자동 감지하지만, **텍스트 필드는 자동 감지 대상이 아니므로 이 스킬이 직접 써야 합니다.**

### 써야 하는 필드

`console-text.md` 확정 직후, 동일한 값을 `.meta-dashboard.json` 에 반영합니다.

| 필드 | 출처 | 비고 |
|---|---|---|
| `nameEn` | console-text.md §1 영어 앱 이름 | 문자열 |
| `aitCategory` | console-text.md §2 카테고리 1차 후보 | 예: `교육·자기계발 > 자격증·시험 > 운전·교통` |
| `subtitle` | console-text.md §3 부제 | 문자열 |
| `keywords` | console-text.md §5 키워드 | `console-text.md §5` 의 키워드는 **쉼표 단독 구분자**(`,`) 로 분리. 키워드 내부에 쉼표 사용 금지 (한글 쉼표 포함). 각 토큰은 앞뒤 공백 제거 후 빈 문자열 제외. 예: `"퀴즈, 성향, 재미"` → `["퀴즈","성향","재미"]`. |
| `isGame` | §2 결정 결과 | `console-text.md §2` 에 **명시적으로** `게임` / `비게임` 결정이 적혀있을 때만 덮어쓴다. 명시 없으면 기존 값을 유지 (특히 기존이 `true` 인 게임 앱을 false 로 덮을 위험 방지). |

> 그 외 필드(`nameKo`, `description`, `logoPath`, `thumbnailPath`, `screenshotPaths`, `prdPath`, `prdReviewedAt`, `prdSource`, `pipelineProgress`, `updatedAt`)는 **건드리지 않습니다.** 각각 다른 주체(ait-plan, 대시보드 서버, wizard)가 소유합니다.

### 반영 방법

```
1. apps/<app-name>/.meta-dashboard.json 을 Read
2. 파싱한 객체에 nameEn/aitCategory/subtitle/keywords/isGame 만 머지
3. updatedAt 필드를 새 ISO 타임스탬프로 갱신 (new Date().toISOString() 상당 값)
4. Write 로 들여쓰기 2칸 JSON 으로 저장 (기존 포맷 유지)

- `isGame` 은 console-text.md 에 명시가 있을 때만 치환. 없으면 기존 객체의 값을 그대로 두고 머지 대상에서 제외.
```

### 파일 상태별 처리 (이분법)

| 상태 | 처리 |
|---|---|
| 파일 정상 | 위 4단계로 머지 후 저장 → ✅ 성공 |
| **파일 없음** | 아래 ".meta-dashboard.json 신규 생성" 절차를 직접 수행 후 4단계 머지 이어서 → ✅ 성공. PRD 를 찾지 못하면 즉시 ❌ 실패 |
| JSON 파싱 실패 | 즉시 중단 → ❌ 실패 (파일 경로 + 파싱 오류 메시지 포함) |
| Write 실패 | ❌ 실패 (권한/경로 문제 원인 보고) |

"그 다음엔 `/ait-meta` 를 실행해 주세요" 같은 후속 단계 안내는 금지 — 스킬이 직접 호출하거나 실패로 보고.

### .meta-dashboard.json 신규 생성

파일이 없으면 직접 초기 파일을 만든 뒤 곧장 위 4단계 머지로 이어간다.

1. **PRD 탐색** (순서대로):
   1. `docs/PRD.md`
   2. `docs/prd.md`
   3. `docs/**/*PRD*.md` (glob)
   4. `docs/**/*prd*.md` (glob)
   5. `docs/**/*.md` 중 내용에 "문제 정의" 또는 "Problem Statement" 포함된 파일

   못 찾으면 즉시 ❌ 실패 (reason: `"PRD not found"`). 이후 단계 진행 금지.

2. **소스코드 분석**: `package.json`, `granite.config.ts|js`, `src/` 최상위(index.tsx/App.tsx/main.tsx 등), PRD 를 읽어 추론.
   - `nameKo`: PRD 제목/첫 문단
   - `nameEn`: PRD 슬로건 또는 package.json name
   - `subtitle`: PRD 핵심 가치 제안 10자 내외 요약
   - `description`: PRD 문제 정의 + 가치 제안 2-3문장
   - `keywords`: PRD 기능/타깃 기반 5개 내외
   - `aitCategory`: 추론 어려우면 `"생활 > 콘텐츠"` 기본값
   - `isGame`: 기본 `false`, PRD 에 게임 명시 시만 `true`

3. **초기 파일 Write** — 아래 스키마로 `.meta-dashboard.json` 생성:

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
     "updatedAt": "2026-04-24T10:00:00.000Z"
   }
   ```

   - `prdPath` 는 STEP 1 에서 발견한 파일의 `appDir` 기준 상대경로
   - `logoPath`, `thumbnailPath`, `screenshotPaths`, `utPath` 는 항상 null / 빈 배열
   - `updatedAt` 은 `new Date().toISOString()` 상당 값 (ISO 8601 full datetime)
   - 모든 경로는 `appDir` 기준 상대경로 (절대경로 금지)

4. 생성 직후 곧장 "반영 방법" 4단계 머지로 이어가 `nameEn/aitCategory/subtitle/keywords/isGame` 을 console-text.md 확정값으로 치환 후 다시 Write.

## 종료

**성공/실패를 이분법으로 한 번만 처리**하고 세션을 마무리한다. 이미지 생성 시 `apps/<app-name>/assets/` 에 PNG + 원본 파일이 생성되고, 텍스트 확정 시 `.meta-dashboard.json` 의 `nameEn/aitCategory/subtitle/keywords/isGame` 이 갱신됩니다. 후속 단계 안내 금지.

### 구조화 상태 신호 (NON-NEGOTIABLE)

대시보드 세션으로 실행될 때 환경변수 `AIT_RUN_STATUS_PATH` 로 per-run JSON 파일 경로가 전달된다. **텍스트로 ✅/❌ 를 찍기 전에 반드시** 이 경로에 `Write` 로 기록한다. 대시보드는 이 파일만 보고 COMPLETED/FAILED 를 결정한다.

성공:
```json
{"status":"success"}
```

실패:
```json
{"status":"failure","reason":"<한 줄 원인 — 예: `.meta-dashboard.json` JSON 파싱 실패>"}
```

대시보드 밖(터미널 직접 호출)에서는 환경변수가 비어있을 수 있으니 있을 때만 기록한다.

### ✅ 성공 사용자 보고 (상태 파일 기록 이후)

```
✅ 에셋 점검 완료
생성/확인된 파일: <경로 리스트>
.meta-dashboard.json 머지 필드: nameEn/aitCategory/subtitle/keywords/isGame
```

### ❌ 실패 사용자 보고 (상태 파일 기록 이후)

```
❌ 에셋 점검 실패
원인: <구체적 사유 — 예: `.meta-dashboard.json` JSON 파싱 실패 / PRD 미존재 / graphic-designer 이미지 생성 3회 실패>
정리된 임시 파일: <있으면 목록, 없으면 "없음">
```

**규칙**: 상태 파일 1회 기록 + 보고 1회 후 종료. `.meta-dashboard.json` 이미지 경로는 건드리지 말고(서버 자동 감지), 콘솔 텍스트 5개 필드(`nameEn`/`aitCategory`/`subtitle`/`keywords`/`isGame`)만 "콘솔 텍스트 필드 반영" 절차로 머지.
