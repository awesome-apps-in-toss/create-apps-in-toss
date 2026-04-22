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

앱 소스코드와 PRD를 분석해 `.meta-dashboard.json`을 자동으로 생성합니다.

## 호출 형식

```
/ait-meta                         # 특정 앱 폴더에서 실행
/ait-meta                         # 레포 루트에서 실행 (앱 선택 필요)
```

---

## 진행 순서

### STEP 0: 컨텍스트 파악

현재 작업 디렉터리를 확인한다.

- **`apps/{appName}/` 내부인 경우** → 해당 앱을 대상으로 STEP 1 진행
- **레포 루트(`barreleye/`)인 경우** → `apps/` 폴더를 읽어 앱 목록을 출력하고, 어떤 앱을 초기화할지 질문한다

앱 목록 출력 예시:

```
apps/ 폴더에서 발견된 앱:
- ideal-person-report
- coupon-wallet
- quiz-app

어떤 앱의 .meta-dashboard.json을 생성할까요?
```

대상 앱이 결정되면 `appDir = apps/{appName}/` 로 설정하고 STEP 1 진행.

---

### STEP 1: PRD 파일 탐색

`appDir` 내에서 PRD 파일을 찾는다. 아래 패턴으로 순서대로 탐색:

1. `docs/PRD.md`
2. `docs/prd.md`
3. `docs/**/*PRD*.md` (glob)
4. `docs/**/*prd*.md` (glob)
5. `docs/**/*.md` 중 내용에 "문제 정의" 또는 "Problem Statement" 포함된 파일

PRD를 찾으면 STEP 2로 진행.  
**못 찾으면** → `/ait-plan` 스킬을 먼저 실행하도록 안내:

```
PRD 파일을 찾지 못했습니다.
먼저 /ait-plan 으로 PRD를 작성해주세요.
PRD가 docs/ 폴더에 저장된 후 다시 이 스킬을 실행하면 됩니다.
```

---

### STEP 2: 소스코드 분석

다음 파일들을 읽어 앱 정보를 수집한다:

| 파일                                                   | 수집 정보                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `package.json`                                         | `name`, `description`, `version`                                  |
| `granite.config.ts` 또는 `granite.config.js`           | `appName`, `displayName`, `primaryColor`                          |
| `src/` 최상위 파일들 (index.tsx, App.tsx, main.tsx 등) | 앱의 핵심 기능 파악                                               |
| PRD 파일 (STEP 1에서 발견)                             | nameKo, nameEn, subtitle, description, keywords, aitCategory 추론 |

PRD에서 추론할 정보:

- **nameKo**: 앱의 한국어 이름 (PRD 제목 또는 첫 문단에서 추출)
- **nameEn**: 앱의 영문 이름 (PRD 슬로건 또는 package.json name에서 추출)
- **subtitle**: 한 줄 소개 (PRD의 핵심 가치 제안에서 10자 내외로 요약)
- **description**: 앱 설명 (PRD 문제 정의 + 가치 제안을 2-3문장으로 요약)
- **keywords**: 핵심 키워드 5개 내외 (PRD 기능/타깃 유저 기반)
- **aitCategory**: 앱인토스 카테고리 (PRD 내용 기반으로 추론, 예: "생활 > 콘텐츠 > 테스트")

---

### STEP 3: .meta-dashboard.json 생성

분석 결과를 바탕으로 아래 스키마에 맞게 파일을 생성한다.

**저장 경로**: `{appDir}/.meta-dashboard.json`

**파일 형식**:

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
  "updatedAt": "현재 날짜 (ISO 8601, 날짜만)"
}
```

규칙:

- `logoPath`, `thumbnailPath`, `screenshotPaths`, `utPath` 는 항상 null / 빈 배열
- `prdPath` 는 STEP 1에서 발견한 파일의 `appDir` 기준 상대경로
- `isGame` 은 기본값 `false` (PRD에서 게임임이 명시된 경우만 `true`)
- `aitCategory` 는 추론 어려우면 `"생활 > 콘텐츠"` 로 기본값 사용
- `updatedAt` 은 오늘 날짜 (예: `"2026-04-12"`)

파일 생성 후 생성된 내용을 간단히 요약해서 보여준다.

---

## 주의사항

- 질문 없이 한 번에 생성한다. 어짜피 대시보드에서 수정 가능하다.
- 이미 `.meta-dashboard.json`이 존재하면 덮어쓰기 전에 확인을 구한다.
- 모든 경로는 `appDir` 기준 상대경로로 작성한다 (절대경로 금지).

---

## 종료

파일 생성이 끝나면 **짧은 완료 보고 한 번**만 출력하고 세션을 마무리한다.

**형식**:

```
✅ .meta-dashboard.json 생성: <파일 경로>
추론한 값: nameKo=<...>, aitCategory=<...>, 키워드 <개수>개
```

**반드시 지킬 것**:

- 이 스킬은 예외적으로 `.meta-dashboard.json` 을 **초기 생성할 수 있는 유일한 스킬**이다. 단, 한 번 생성한 뒤에는 대시보드 서버가 SSOT 로 소유하므로 갱신은 대시보드에서 이루어져야 한다.
- 다음 단계로 **어떤 슬래시 커맨드도** 권유하지 말 것. 대시보드가 파이프라인 카드로 다음 단계를 자동 안내한다.
- 사과/추임새 최소화, 본론만.
