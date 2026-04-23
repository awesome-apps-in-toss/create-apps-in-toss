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
   - **상세 설명** 작성 시 아래 "상세 설명 작성 가이드" 섹션 참고

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

모든 텍스트 입력 필드에 공통 적용:

- **허용 특수문자**: `:`, `∙`, `?` 만 사용 가능
- **이모지 사용 불가**
- 그 외 특수문자(`!`, `@`, `#`, `$`, `%`, `&`, `*` 등) 사용 불가
- 검증 시 위반 항목을 명확히 지적하고 대체 표현 제안

## 상세 설명 작성 가이드

상세 설명은 선택이지만, AI가 토스 홈 광고 등 마케팅 소재를 자동 생성하는 데 활용됨.
구체적으로 작성할수록 더 다양하고 매력적인 광고가 생성됨.

### 작성 원칙

- 누구나 이해할 수 있는 **쉬운 단어** 사용
- 서비스 경험을 **최대한 구체적으로, 많이** 기술
- 사용자가 **보고, 누르고, 경험하는 것**을 흐름에 따라 설명

### 예시 (맛집 탐색 서비스)

> 거주 지역을 입력하면 근처 맛집 지도를 보여줘요. 맛집 지도에서 양식, 중식, 한식 등 음식 카테고리별로 검색할 수 있어요. 검색한 맛집에 하트 버튼을 누르면 찜할 수 있어요. 맘에 드는 맛집을 발견하면 버튼을 눌러 웨이팅을 바로 등록할 수 있어요.

---

## 이미지 생성 위임

이미지 리소스(로고·정방형 썸네일·가로형 썸네일)는 **`graphic-designer` 에이전트**가 생성합니다.
SKILL은 어떤 에셋이 필요한지 확인하고, 출력 경로·대상 앱 정보만 전달하여 위임합니다.

생성 방식·스타일·제약·워크플로 등 **디테일은 에이전트 문서(`.claude/agents/graphic-designer.md`)에 정의**되어 있으므로 SKILL에서 중복 기술하지 않습니다.

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
  PRD: apps/<app-name>/docs/planning.md 참고

  작업 완료 후 생성된 파일 경로와 디자인 컨셉 1줄 요약을 보고해 주세요.
```

에이전트는 자율적으로:
- PRD·granite.config.ts·src/를 읽어 서비스 이해
- 로고는 플랫 SVG 심볼로 생성 (서비스 의미 반영, 일반성 검증 포함)
- 썸네일은 HTML/CSS 앱 UI 목업으로 생성
- 제약 준수 + 검증 루프를 거쳐 최종 PNG 제출

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

에이전트가 아래 경우에 자율 실행을 중단하고 되돌아올 수 있습니다. 사용자에게 전달해 협의합니다:

- **PRD 부족**으로 서비스 본질 추론 불가 → 에이전트가 필요 정보를 구체적으로 질문
- **3회 반복해도 일반성 검증 통과 실패** → 시도한 후보와 탈락 이유를 받아 방향성 상담

## 콘솔 텍스트 필드 반영

대시보드의 **스토어 등록 자료** 카드는 `apps/<app-name>/.meta-dashboard.json` 의 필드를 읽어 표시합니다.
이미지 경로(`logoPath`, `thumbnailPath`, `screenshotPaths`)는 `assets/` 파일 존재로 서버가 자동 감지하지만,
**텍스트 필드는 자동 감지 대상이 아니므로 이 스킬이 직접 써줘야 합니다.**

### 써야 하는 필드

`console-text.md` 확정 직후, 동일한 값을 `.meta-dashboard.json` 에 반영합니다.

| 필드 | 출처 | 비고 |
|---|---|---|
| `nameEn` | console-text.md §1 영어 앱 이름 | 문자열 |
| `aitCategory` | console-text.md §2 카테고리 1차 후보 | 예: `교육·자기계발 > 자격증·시험 > 운전·교통` |
| `subtitle` | console-text.md §3 부제 | 문자열 |
| `keywords` | console-text.md §5 키워드 | 쉼표 분리 → 문자열 배열 |
| `isGame` | §2 결정 결과 | 비게임이면 `false` |

> 그 외 필드(`nameKo`, `description`, `logoPath`, `thumbnailPath`, `screenshotPaths`, `prdPath`, `prdReviewedAt`, `prdSource`, `pipelineProgress`, `updatedAt`)는 **건드리지 않습니다.**
> 각각 다른 주체(ait-plan, 대시보드 서버, wizard)가 소유합니다.

### 반영 방법

`Read` → 기존 JSON 로드 → 위 필드만 치환 → `Write` 로 덮어쓰기.

```
1. apps/<app-name>/.meta-dashboard.json 을 Read
2. 파싱한 객체에 nameEn/aitCategory/subtitle/keywords/isGame 만 머지
3. updatedAt 필드를 새 ISO 타임스탬프로 갱신 (new Date().toISOString() 상당 값)
4. Write 로 들여쓰기 2칸 JSON 으로 저장 (기존 포맷 유지)
```

파일이 없거나 JSON 파싱 실패 시엔 스킬을 중단하고 사용자에게 보고합니다 — `.meta-dashboard.json` 초기 생성은 `ait-meta` 스킬의 책임입니다.

## 결과물

미비 항목이 있으면 필요한 규격과 가이드라인을 상세히 안내합니다.
이미지 생성 요청 시 `apps/<app-name>/assets/` 디렉토리에 PNG + 원본 파일이 생성됩니다.
콘솔 텍스트 필드가 확정되면 `.meta-dashboard.json` 의 `nameEn/aitCategory/subtitle/keywords/isGame` 이 갱신됩니다.

## 종료

산출물이 확정되면 **짧은 완료 보고 한 번**만 출력하고 세션을 마무리한다.

**형식**:

```
✅ 에셋 점검 완료
생성/확인된 파일: <경로 리스트>
```

**규칙**: 완료 보고 1회 후 종료. `.meta-dashboard.json` 이미지 경로는 건드리지 말고(서버 자동 감지), 콘솔 텍스트 5개 필드(`nameEn`/`aitCategory`/`subtitle`/`keywords`/`isGame`)만 "콘솔 텍스트 필드 반영" 절차로 머지.
