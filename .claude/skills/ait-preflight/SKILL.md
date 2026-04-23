---
name: ait-preflight
description: Claude 스킬·에이전트가 정상 동작할 수 있는 환경인지 점검. 시스템·MCP·에셋 도구·환경변수를 한 번에 확인하고 실패 항목에 대한 해결 가이드를 제공.
argument-hint: '[--app <앱 이름>] [--json]'
mode: automated
label: 사전 체크
produces: preflight report
requires: []
inputs:
  - { key: app, type: string, required: false }
  - { key: json, type: boolean, required: false }
outputs:
  - { key: report, type: text }
idempotencyKey: ait-preflight
---

# 사전 환경 체크

Claude 스킬·에이전트가 문제없이 동작할 수 있는지 환경을 점검합니다.
실제 체크 로직은 `scripts/preflight.js`에 있고, SKILL은 이를 실행·해석·안내합니다.

## 언제 실행하는가

- **신규 환경 셋업 직후** (git clone 후 최초 1회)
- **문제 발생 시 진단** — 에셋 생성·에이전트 실행 등이 실패할 때 원인 파악
- **다른 스킬 실행 전 자동 게이팅** (ait-launch, ait-assets 등이 내부적으로 호출)

## 실행 절차

1. **`pnpm preflight` 또는 `node scripts/preflight.js` 실행**
   - `--app <앱이름>` 인자가 주어지면 앱별 체크도 함께 수행
   - `--json` 플래그로 기계 판독 출력도 가능

2. **결과 해석**
   - 종료 코드 `0`: 모두 통과 → 바로 다음 단계 진행 가능
   - 종료 코드 `1`: 필수 체크 실패 → 아래 "실패 항목 해결 가이드" 참고 후 재실행
   - 종료 코드 `2`: 경고만 있음 → 해당 기능 사용 시에만 영향, 대부분 스킵 가능

3. **실패·경고 항목에 대해 사용자에게 해결 방법 안내**
   - 아래 "실패 항목 해결 가이드" 참고

## 체크 카테고리

| 카테고리 | 항목 | 레벨 |
|---|---|---|
| 시스템 | node ≥ 20, pnpm, git, curl | 🔴 Fail |
| 시스템 | ax (AppsInToss CLI) | 🟡 Warn |
| Claude Code | `.mcp.json` 루트 경로, puppeteer MCP 연결 | 🔴 Fail |
| Claude Code | apps-in-toss MCP 연결 | 🟡 Warn |
| 에셋 도구 | sharp-cli/capture-website-cli npx 캐시, puppeteer devDep, jq/python3 | 🟡 Warn |
| 환경변수 | `.env` 존재, `OPENAI_API_KEY` | 🟡 Warn |
| 앱 (optional) | `apps/<name>/` 및 `granite.config.ts`, `package.json` | 🟡/🔴 |

## 실패 항목 해결 가이드

### 시스템 (🔴 Fail)

- **node 버전 부족** — [volta](https://volta.sh) 또는 [nvm](https://github.com/nvm-sh/nvm)으로 Node 20+ 설치
- **pnpm 미설치** — `npm install -g pnpm@9` 또는 `corepack enable`
- **git·curl 미설치** — OS 패키지 매니저로 설치 (macOS: `brew install`, Ubuntu: `apt install`)

### 시스템 (🟡 Warn)

- **ax (AppsInToss CLI) 미설치** — SDK/TDS 문서 검색 MCP(`apps-in-toss`) 가 안 뜸. 설치해도 기능 동작은 가능 (모델이 sibling 앱·로컬 소스로 폴백) 하지만 문서 질의가 부정확해질 수 있음.
  - Windows: `scoop install ax`
  - macOS: `brew install ax`
  - 또는 AppsInToss 개발자 포털(<https://developers-apps-in-toss.toss.im>) 의 ax CLI 설치 가이드 참고
  - 설치 후 Claude Code 재시작 필요

### Claude Code (🔴 Fail)

- **.mcp.json 없음** — 프로젝트 루트에 `.mcp.json` 파일이 있어야 함. 과거 `.claude/mcp.json`에 있었다면 `git mv .claude/mcp.json .mcp.json`
- **puppeteer MCP 연결 안됨**
  1. `claude mcp list` 로 상태 확인
  2. Claude Code **재시작** (MCP는 세션 시작 시 기동됨)
  3. 프로젝트 스코프 MCP는 **최초 1회 사용자 승인**이 필요할 수 있음 — 에이전트 실행 시 승인 프롬프트 표시됨

### Claude Code (🟡 Warn)

- **apps-in-toss MCP 연결 안됨** — 보통 `ax` 바이너리가 PATH 에 없어서 발생. 위 "시스템 (🟡 Warn) · ax 미설치" 가이드대로 설치 후 Claude Code 재시작. 이 MCP 없어도 대부분 스킬은 동작하지만 `search_docs` / `search_tds_web_docs` 가 비활성화되어 SDK·TDS 최신 문서 질의가 불가능해진다.

### 에셋 도구 (🟡 Warn)

- **sharp-cli / capture-website-cli 미캐시** — 네트워크 연결 상태에서 최초 1회 실행 시 자동 다운로드. `capture-website-cli`는 Chromium을 포함해 ~170MB이므로 첫 실행 시 timeout 넉넉히(10분) 설정
- **puppeteer devDep 미설치** — 루트에서 `pnpm install`
- **jq 또는 python3 없음** — DALL-E 캐릭터 생성 시에만 필요 (b64 디코딩). 둘 중 하나만 있으면 됨. macOS: `brew install jq`

### 환경변수 (🟡 Warn)

- **.env 없음** — `cp .env.example .env` 후 필요한 키 입력
- **OPENAI_API_KEY 미설정** — DALL-E 캐릭터 생성 기능에만 영향. 일반 로고·썸네일·스크린샷 생성엔 무관

### 앱 (optional)

- **`apps/<name>/` 없음** — 앱 이름 오타 또는 아직 스캐폴딩 안 됨 → `/ait-scaffold` 실행
- **`granite.config.ts` 없음** — 스캐폴딩이 불완전. `/ait-scaffold` 재실행 또는 수동 복구

## 결과물

체크 결과를 표로 정리해서 사용자에게 보고하고, 실패·경고 항목이 있으면 위 가이드에 따라 수정 방법을 안내합니다.

---

## 종료

점검 결과 보고 후 **짧은 요약 한 번**만 출력하고 세션을 마무리한다.

**형식**:

```
✅ preflight 완료 (종료 코드 <code>)
Fail: <개수> · Warn: <개수>
```

**규칙**: 완료 보고 1회 후 종료. "문제 해결 후 다시 체크" 정도로만 마무리.
