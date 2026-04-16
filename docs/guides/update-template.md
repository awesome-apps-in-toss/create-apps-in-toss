# 템플릿 업데이트 받기

이 프로젝트는 [Awesome-Apps-in-Toss/create-apps-in-toss](https://github.com/Awesome-Apps-in-Toss/create-apps-in-toss) 원본에서 스킬·스크립트·대시보드·문서가 계속 개선됩니다. `npx create-apps-in-toss`로 스캐폴드했든, 레포를 포크/클론했든 동일한 방식으로 upstream 변경사항을 받아올 수 있습니다.

## 사용법

```bash
pnpm update-template
```

## 동작 방식 (SHA baseline)

프로젝트 루트의 **`.barreleye-template.json`** 이 마지막으로 동기화된 upstream SHA를 기록합니다. 이 파일을 기준으로 upstream의 어떤 파일이 추가/수정/삭제되었는지 계산합니다.

1. `upstream` remote가 없으면 자동으로 추가 (`origin`이 원본을 가리키면 그대로 사용). URL이 공식 레포와 다르면 중단.
2. `core.autocrlf=true` 감지 시 경고 (CRLF 변환으로 불필요한 diff가 생길 수 있음)
3. `upstream/main` fetch (FETCH_HEAD 기준)
4. **baseline 결정**:
   - `.barreleye-template.json`의 SHA 사용
   - 없으면 `git merge-base upstream/main HEAD`로 자동 추정 (기존 clone 사용자 마이그레이션)
   - 그것도 실패하면 **스크립트 중단** (데이터 손실 방지). 의도적으로 HEAD를 baseline으로 쓰려면 `pnpm update-template --allow-head-fallback` (로컬 tracked 파일이 삭제될 수 있음)
5. 아래 경로에 대해 `baseline..FETCH_HEAD` diff 적용:
   - upstream이 **삭제한** 파일 → 로컬에서도 제거
   - upstream이 **추가/수정한** 파일 → 로컬에 덮어쓰기
   - baseline 이후 사용자가 추가한 tracked 파일·untracked 파일 → **보존**
6. `.barreleye-template.json`을 새 SHA로 업데이트
7. 변경사항을 unstage 상태로 워킹트리에 남김
8. 변경 파일이 있었을 때만 `pnpm install` 실행

## 동기화 대상

- `.claude/` (스킬·에이전트·mcp 설정)
- `.husky/` (git hook)
- `scripts/`
- `packages/` (공용 tsconfig·eslint·ui)
- `docs/`
- `internal/dashboard/` (관리 대시보드)
- 루트 설정 파일 (`turbo.json`, `tsconfig.json`, `eslint.config.js`, `pnpm-workspace.yaml`, `vercel.json`, `.gitignore`, `.gitattributes`, `CLAUDE.md`, `AGENTS.md`)

## 동기화되지 **않는** 파일

사용자 커스터마이징이 쌓일 가능성이 높은 파일은 의도적으로 제외됩니다:

- `apps/*` — **당신이 만든 미니앱은 절대 건드리지 않습니다.** 어떤 하위 경로도 update-template이 수정·삭제하지 않습니다.
- `package.json` — 루트 dependencies/scripts에 본인 앱용 항목이 있을 수 있어 자동 덮어쓰지 않습니다.
- `pnpm-lock.yaml` — package.json이 fork마다 달라져서 lockfile도 갈라지는 게 정상입니다.
- `README.md` — 프로젝트 설명은 fork마다 다릅니다.
- `internal/create-apps-in-toss/` — 스캐폴더 패키지. scaffold 시 제거되며 upstream 개발자만 관리합니다.
- `.env*`, `node_modules/`, 빌드 산출물

### 레거시 `apps/dashboard/` 마이그레이션

대시보드가 `apps/`에 있던 시절 포크·클론한 경우, 업데이트 후 두 경로가 공존합니다:

- 새 `internal/dashboard/` — upstream 최신본
- 기존 `apps/dashboard/` — 로컬에 남아있음 (안전하게 보존)

**`apps/dashboard/`에 본인이 추가한 로컬 변경이 없다면** 수동으로 제거:

```bash
git diff apps/dashboard internal/dashboard   # 로컬 커스터마이징 비교
git rm -r apps/dashboard
git commit -m "chore: remove legacy apps/dashboard"
```

로컬 커스터마이징이 있다면 `internal/dashboard/`로 옮긴 뒤 제거하세요. `pnpm update-template`은 `apps/dashboard/`를 감지하면 종료 시 안내 메시지를 출력합니다.

upstream이 새 script를 추가했다면 수동으로 반영 (remote 이름은 `upstream` 또는 `origin`):

```bash
git show upstream/main:package.json   # 또는 origin/main
```

## `.barreleye-template.json`

`npx create-apps-in-toss`로 scaffold하면 자동 생성됩니다:

```json
{
  "repository": "Awesome-Apps-in-Toss/create-apps-in-toss",
  "branch": "main",
  "sha": "a1b2c3d...",
  "scaffoldedAt": "2026-04-16T12:34:56.000Z",
  "scaffolder": "create-apps-in-toss@0.1.0"
}
```

**git에 커밋하세요** — 팀원들이 같은 baseline에서 업데이트를 받도록.

기존 clone 사용자는 이 파일이 없어도 `pnpm update-template`이 자동으로 `merge-base`를 추정하고, 첫 실행 후 파일을 생성합니다.

## 동기화 제외 설정 (`.barreleye-sync-ignore`)

특정 경로를 동기화에서 빼려면 레포 루트에 `.barreleye-sync-ignore` 파일을 만드세요. 각 줄에 SYNC_PATHS 중 하나를 적으면 됩니다.

```
# 예시: 내 프로젝트 커스텀 스킬이 있는 경우
.claude
docs
```

## 환경변수

- `BARRELEYE_TEMPLATE_BRANCH` — fetch할 upstream 브랜치 (기본: `main`, RC 테스트용)
- `BARRELEYE_SKIP_TEMPLATE_CHECK=1` — postinstall 자동 체크 끄기
- `CI=true` — postinstall 자동 스킵

## 로컬 수정이 덮어써지는 경우

**동기화 대상 경로 내에서 upstream에도 존재하는 파일**을 수정했다면 덮어써집니다. 고정이 필요하면 `.barreleye-sync-ignore`에 등록하세요. 템플릿 공용 파일을 개선해야 한다면 원본 레포에 PR을 올리는 것을 권장합니다.

**baseline 이후 로컬에서만 추가한 파일**(upstream에 존재하지 않는 파일)은 보존됩니다. 예: `.claude/skills/my-custom/SKILL.md`는 그대로 남습니다. 단 `--allow-head-fallback` 모드에서는 baseline이 HEAD가 되어 사용자가 추가한 tracked 파일도 삭제 대상이 될 수 있으니 주의하세요.

실수로 로컬 변경을 잃었다면 `git reflog`로 이전 상태를 확인:

```bash
git reflog                              # 이전 HEAD 목록 확인
git switch -c backup-before-sync <해시> # 잃어버린 상태로 새 브랜치 생성
git restore --source=<해시> -- <경로>   # 특정 파일만 복구
```

## 사전 체크

스크립트는 **modified/staged 변경이 있으면 중단**합니다. untracked 파일(새 `.env.local`, 작성 중인 앱)은 허용합니다.

```bash
git status
git stash
pnpm update-template
git stash pop
```

## 자동 알림

`pnpm install` 실행 시 `postinstall` 훅이 upstream에 새 커밋이 있는지 조용히 확인합니다:

- **24시간 쿨다운** — 한 번 체크하면 24h 동안 재체크 안 함 (GitHub rate limit/네트워크 비용 절약). 쿨다운은 `node_modules/.cache/barreleye-template-check`에 저장되므로 `pnpm clean` 시 초기화됨
- **3초 timeout** — 오프라인/사내망에서 install이 hang되지 않음
- remote가 공식 레포를 가리키지 않으면 스킵
- `CI=true` 스킵
- `BARRELEYE_SKIP_TEMPLATE_CHECK=1`로 영구 off

## 실행 후

변경사항은 **unstage 상태**로 워킹트리에 남습니다:

```bash
git status
git diff
git add -A && git commit -m "chore: sync template from upstream"
```

커밋에는 업데이트된 `.barreleye-template.json` (새 SHA)도 포함됩니다.
