# 템플릿 업데이트 받기

이 프로젝트는 [Awesome-Apps-in-Toss/create-apps-in-toss](https://github.com/Awesome-Apps-in-Toss/create-apps-in-toss) 원본에서 스킬·스크립트·대시보드·문서가 계속 개선됩니다. 클론한 뒤에도 upstream 변경사항을 받아올 수 있도록 동기화 스크립트가 포함되어 있습니다.

## 사용법

```bash
pnpm update-template
```

동작:

1. `upstream` remote가 없으면 자동으로 추가 (`origin`이 원본을 가리키면 그대로 사용). URL이 공식 레포와 다르면 중단합니다.
2. `core.autocrlf=true` 감지 시 경고 (CRLF 변환으로 불필요한 diff가 생길 수 있음)
3. `upstream/main`을 fetch (FETCH_HEAD 기준)
4. 아래 경로를 upstream 버전으로 동기화. **동기화 대상 경로 안에서 upstream에 없는 파일은 로컬에서도 제거됩니다** — upstream이 삭제한 파일뿐 아니라, 사용자가 그 경로 안에 추가한 커스텀 파일(예: `.claude/skills/mine/`, `docs/my-note.md`)도 함께 제거된다는 뜻입니다. 보존이 필요하면 `.barreleye-sync-ignore`에 해당 상위 경로를 등록하거나, 동기화 대상 밖(예: `apps/<your-app>/`)에 두세요.
5. 변경사항을 unstage 상태로 워킹트리에 남김
6. `pnpm install` 실행

## 동기화 대상

- `.claude/` (스킬·에이전트·mcp 설정)
- `.husky/` (git hook)
- `scripts/`
- `packages/` (공용 tsconfig·eslint·ui)
- `docs/`
- `apps/dashboard/`
- 루트 설정 파일 (`turbo.json`, `tsconfig.json`, `eslint.config.js`, `pnpm-workspace.yaml`, `vercel.json`, `.gitignore`, `.gitattributes`, `CLAUDE.md`, `AGENTS.md`)

## 동기화되지 **않는** 파일

사용자 커스터마이징이 쌓일 가능성이 높은 파일은 의도적으로 제외됩니다:

- `package.json` — 루트 dependencies/scripts에 본인 앱용 항목이 있을 수 있어 자동 덮어쓰지 않습니다.
- `pnpm-lock.yaml` — package.json이 fork마다 달라져서 lockfile도 갈라지는 게 정상입니다.
- `README.md` — 프로젝트 설명은 fork마다 다릅니다.
- `apps/*` (단 `apps/dashboard` 제외) — 당신이 만든 미니앱은 절대 건드리지 않습니다.
- `.env*`, `node_modules/`, 빌드 산출물

upstream이 새 script를 추가했다면 수동으로 반영:

```bash
git show upstream/main:package.json
```

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

## 충돌 정책

**동기화 대상 경로는 항상 upstream이 우선**합니다. 해당 경로의 로컬 수정은 덮어써질 수 있으니, 고정이 필요하면 `.barreleye-sync-ignore`에 등록하세요. 템플릿 공용 파일을 수정해야 한다면 원본 레포에 PR을 올리는 것을 권장합니다.

실수로 로컬 변경을 잃었다면 먼저 `git reflog`로 이전 상태를 확인하고 안전하게 복구하세요:

```bash
git reflog                              # 이전 HEAD 목록 확인
git switch -c backup-before-sync <해시> # 잃어버린 상태로 새 브랜치 생성
git restore --source=<해시> -- <경로>   # 특정 파일만 복구
```

`git reset --hard`는 최후의 수단입니다.

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
