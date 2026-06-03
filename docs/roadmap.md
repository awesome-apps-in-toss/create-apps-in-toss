# Barreleye Roadmap

> `npx create-apps-in-toss` 기반 모노레포 + 로컬 대시보드로, **비개발자도 Claude Code만 사용해** 앱인토스 미니앱을 출시할 수 있게 만드는 것이 최종 목표입니다.
>
> 이 문서는 합의된 방향과 제약, 단계별 우선순위를 한 곳에 모아 둡니다. 작업 진척에 따라 갱신됩니다. 날짜 대신 **주(Week)/분기** 단위로 상대적인 순서를 기록합니다.

---

## 0. v0.4 방향 전환 — 대시보드 축소 (2026-06)

> 아래 §1.2 와 §3 Week 3 · §4 Phase 1 의 일부 항목은 이 전환으로 **대체(superseded)** 됐습니다.

대시보드 안에서 `claude -p` 로 스킬을 직접 실행하던 **오케스트레이션 계층을 제거**하고, 대시보드를 **읽기 전용 조망 + 명령 런처**로 축소했습니다. 실제 작업(8단계 파이프라인)은 터미널에서 **Claude Code / Codex** 로 진행합니다.

- **제거**: `/api/orchestrations`·`/api/diagnostics`·dev-server·create-app 라우트, RunSession/SQLite(`better-sqlite3`), `<RunTimeline>`·`<ClaudeStatus>`·`<Wizard>`(`/wizard/:appId`)·`<ArtifactReviewCard>`·`<SkillInputForm>`·NewApp 페이지
- **유지**: 3-레이어 메타데이터 조망, 읽기 전용 미니 스테퍼, `.meta-dashboard.json` 콘솔 필드 인라인 편집, SSE 파일 감시
- **신규**: 단계별 `claude "/ait-xxx"` · codex 실행 명령 **복사 칩**(CommandChips)

§1.2 의 "대시보드 GUI 위저드 / 터미널·코드 편집 없음" 전제는 **"대시보드로 조망 + 터미널에서 claude/codex 실행"** 으로 재정의됩니다. 비개발자 친화(§1.2 목표 자체)는 유지하되, 수단이 위저드 자동 실행 → 명령 복사로 바뀌었습니다. Phase 2·3(§5·§6)의 세부 재계획은 별도 논의로 남겨 둡니다.

---

## 1. 목표 (North Star)

1. **템플릿 단일화**: `npx create-apps-in-toss`로 생성된 모든 프로젝트가 upstream 변경(보안 패치, 앱인토스 SDK 호환성, 신규 스킬)을 **안전하게 자동 수신**한다.
2. **비개발자 친화**: 대시보드가 `/ait-plan → /ait-build` 8단계를 GUI 위저드로 감싸서, 사용자는 “아이디어 입력 → 단계별 확인 → 콘솔 업로드”만 수행한다. 터미널/코드 편집 없음.
3. **Claude Code OAuth 전용**: 로컬 CLI가 이미 로그인된 사용자 세션으로만 동작한다. 별도 API 결제/토큰 프록시/클라우드 실행 **없음**.

## 2. 설계 원칙 / 약관 경계 (불변)

| 원칙 | 이유 |
|---|---|
| **로컬 전용, SaaS 프록시 금지** | Claude Code 약관상 개인 계정 세션을 다른 사용자에게 중계 불가. |
| **서버는 127.0.0.1 기본 바인딩** | 로컬 네트워크 노출 최소화. 외부 바인딩은 명시적 환경변수 필요. |
| **1 PC = 1 Claude Code 로그인** | 다중 사용자 계정 공유 금지. |
| **Claude CLI 권한 최소화** | `--dangerously-skip-permissions` 금지. `--permission-mode acceptEdits` 기본값, Bash/네트워크는 사용자 확인 유지. |
| **템플릿 갱신은 additive 우선** | `scripts/update-template.js`가 사용자의 `apps/*`를 **건드리지 않음**. `internal/`만 동기화. |
| **스킬은 선언적 frontmatter 단일 출처** | 파이프라인 구조는 코드가 아닌 `.claude/skills/*/SKILL.md`에서 파생. |

## 3. 현재 상태 (2026-04 기준)

### ✅ 완료 (Week 1)

| PR | 요지 |
|---|---|
| #8 | 접근성·반응형·성능 감사 대응 (리팩토링) |
| #9 | watcher `apps/` 미감시 버그 + 문서 포트 drift(5173 → 3000) 정정 |
| #10 | 127.0.0.1 바인딩 + Claude CLI 권한 옵션 축소 (`--permission-mode acceptEdits`) |
| #11 | server 코드 typecheck 범위 편입 (드러나지 않던 타입 에러 차단) |

### ✅ 완료 (Week 2)

| PR | 요지 |
|---|---|
| #12 | `docs/roadmap.md` 추가 — 합의된 방향 단일 출처화 |
| #13 | `.claude/skills/ait-*/SKILL.md` frontmatter 표준화(`mode`·`step`·`requires`·`inputs`·`outputs`·`idempotencyKey`) + `GET /api/skills` 동적 스캐너 |
| #14 | `/api/orchestrations` 프로토타입 (ait-plan 한정, 서버 전용). `POST /` · `GET …/stream` (SSE) · `POST …/input` · `POST …/cancel`. RunSession 상태머신 + Claude CLI `stream-json` 래핑. in-memory `Map<runId, RunSession>` |

### ✅ 완료 (Week 3)

| 항목 | 요지 |
|---|---|
| 프론트 `GET /api/skills` 소비 | 하드코딩 `PIPELINE_SKILLS` 제거, `SkillsProvider` + `useSkills()` 훅으로 파이프라인 형상을 동적 구성 |
| 7-skill 오케스트레이션 | `POST /api/orchestrations { skill, appName, input, forceRerun }` — `readSkillMeta` 로 검증, scaffold/launch 는 REPO_ROOT 나머지는 `apps/<appName>` 실행 |
| SQLite 영속화 | `better-sqlite3` + `runs`·`events` 테이블, WAL 모드. 서버 재기동 시 고아 run 을 FAILED 로 마킹 |
| idempotency | 동일 (skill,appName) 이 RUNNING 이면 그걸 반환, (skill,appName,idempotencyKey) 의 최근 COMPLETED 가 있으면 캐시 재사용 — `forceRerun:true` 로 우회 |
| Run Timeline UI | `<RunTimeline>` 이 8단계 세로 카드 + 최근 run 상태/시간/exit 표시. 실행 시 인라인 SSE 라이브 로그 패널 |
| Claude CLI 진단 | `GET /api/diagnostics/claude` + `<ClaudeStatus>` 배너 — 설치/로그인/버전 요약 |
| 에러 복구 카드 | exitCode·stderr 힌트 기반 한국어 진단 + 원샷 다시 시도 |
| 입력 폼 템플릿 | `SKILL.md` frontmatter `inputs` 선언을 기반으로 `<SkillInputForm>` 이 동적 렌더 (text/textarea/color/select/file) |
| 선형 위저드 | `/wizard/:appId` — 다음 단계 hero + 전체 타임라인 + 산출물 리뷰 카드 |
| 아티팩트 리뷰 카드 | `<ArtifactReviewCard>` step 번호에 따라 PRD/에셋/granite.config/TDS 등 분기 렌더 |

---

## 4. Phase 1 — Foundation (0–3개월)

**목적**: 오케스트레이션 엔진 + 비개발자 대응 **최소 위저드**를 세운다.

### Week 3–4: 오케스트레이션 확장 ✅
- [x] 8개 파이프라인 스킬 전부를 `/api/orchestrations`로 실행 가능하게 확장
- [x] `RunSession` 영속화 (SQLite, `internal/dashboard/data/runs.db`)
- [x] 재실행/이어하기 (idempotencyKey 기반 중복 스킵)
- [x] 대시보드에 **Run Timeline** UI (현재 단계, 대기중 입력, 아티팩트 미리보기)
- [x] Claude CLI 버전/로그인 상태 진단 화면

### Month 2: 비개발자 위저드 모드 🚧 (초기 MVP)
- [x] `/wizard/:appId` 라우트 — 선형 step-by-step UI
- [x] 단계 경계에서 **아티팩트 리뷰 카드** (PRD, 로고 썸네일 프리뷰, granite.config.ts 요약)
- [x] 에러 복구 가이드 (한국어 일반인용 문구, "다시 시도" 버튼 원샷)
- [x] 입력 폼 템플릿화 (아이디어/브랜드 컬러/타깃 유저 → 구조화 JSON, frontmatter 기반 동적 렌더)
- [ ] PRD diff viewer (v2 변경 시 이전 버전과 비교)
- [ ] 단계별 산출물 드래그-드롭 교체 (아이콘/스크린샷 등)

### Month 3: 배포 패키징
- [ ] `create-apps-in-toss` 1.0 — 처음 로그인 경험 (Claude CLI 미설치 감지, 안내, dry-run 스캐폴드)
- [ ] 자체 `pnpm update-template` 원클릭 버튼 (대시보드에서 실행 + 충돌 미리보기)
- [ ] `docs/launch-flow/*` 위저드 사이드바 연동 (현재 단계 문서 자동 강조)
- [ ] 출시 체크리스트: 앱인토스 콘솔 업로드 가이드 (스크린샷 + 메타 JSON 내보내기)

**Phase 1 종료 조건**
1. 비개발자 테스터 1명이 대시보드만으로 샘플 앱을 콘솔 업로드 직전까지 진행 가능.
2. 모든 스킬이 frontmatter에서 선언적으로 정의되고, 코드 변경 없이 스킬 추가 가능.
3. 템플릿 sync가 파괴적 작업 없이 3회 연속 성공.

---

## 5. Phase 2 — Non-dev UX (3–6개월)

**목적**: “Claude Code 사용법을 몰라도 되는” 수준으로 마감한다.

- [ ] **대시보드 i18n / tone 정비** — 개발자 용어 제거, 비유/예시 중심 문구
- [ ] **멀티 앱 관리** — 앱 목록 대시보드에서 파이프라인 진척률 카드 (plan/implement/review/build)
- [ ] **아티팩트 편집기** — PRD는 마크다운 인라인 에디터, 브랜드 자산은 드래그-드롭 교체
- [ ] **자동 QA 게이트** — `/ait-review` 결과가 FAIL이면 build 단계 진입 차단
- [ ] **안전한 update-template** — 로컬 수정 감지 시 충돌 브랜치 자동 생성 후 3-way merge 프리뷰
- [ ] **오프라인/네트워크 장애 내성** — Claude API 장애, GitHub API rate limit에 대한 복구 흐름
- [ ] **사용성 데이터(로컬 only)** — 각 단계별 소요 시간/실패 지점을 로컬에 기록 (telemetry 외부 전송 없음)

---

## 6. Phase 3 — Ecosystem (6–12개월)

**목적**: 개인 도구를 넘어, 비개발자 커뮤니티와 템플릿 생태계를 뒷받침한다.

- [ ] **커뮤니티 템플릿 레지스트리** — `ait-scaffold`에 복수 템플릿 선택지 (e.g. TDS 기본 / 미니 게임 / 폼 기반 서비스)
- [ ] **스킬 플러그인 기반** — `.claude/skills/*`를 npm package로 배포 가능, `ait add-skill <name>`
- [ ] **통합 커넥터** — Supabase/Notion/Google Forms 등 비개발자가 자주 쓰는 백엔드 bootstrap 스킬
- [ ] **앱 쇼케이스** — 대시보드 내 “내가 만든 앱” 갤러리 + 선택적 GitHub 공개 PR
- [ ] **자가 개선 루프** — `/ait-review`가 반복 실패 패턴을 감지해 SKILL.md에 PR 제안 (사용자 승인 필수)
- [ ] **Observability** — 로컬 로그 뷰어(대시보드), 오류 리포트 익스포트(사용자 수동 제출)

---

## 7. 추적 규칙

- 이 파일은 “합의된 방향”만 기록합니다. **진행 상태**는 PR/이슈/커밋으로 관리하고, 여기엔 체크박스 수준으로만 반영합니다.
- 새 단계를 시작할 때마다 `Current State` 섹션을 갱신합니다. 완료된 PR 번호를 남겨 후속 작업자가 맥락을 빠르게 잡을 수 있게 합니다.
- 원칙(섹션 2)은 **절대 우회하지 않습니다**. 변경이 필요하면 별도 PR로 먼저 원칙을 수정합니다.
