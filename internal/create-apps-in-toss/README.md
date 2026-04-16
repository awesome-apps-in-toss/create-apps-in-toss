# create-apps-in-toss

[apps-in-toss](https://toss.im/apps-in-toss) 미니앱 모노레포 템플릿 스캐폴더.

## 사용법

```bash
npx create-apps-in-toss my-miniapp
cd my-miniapp
pnpm dev
```

## 옵션

```
npx create-apps-in-toss [project-dir] [options]

  -b, --branch <name>   fetch할 upstream 브랜치 (기본: main)
  --skip-install        의존성 설치 스킵
  --skip-git            git init 스킵
  -h, --help            도움말
```

## 환경변수

- `GITHUB_TOKEN` — GitHub API rate limit을 5000/hr로 확장 (선택, `export GITHUB_TOKEN=$(gh auth token)`)
- `BARRELEYE_TEMPLATE_BRANCH` — fetch할 upstream 브랜치 (기본 `main`)

## 생성 결과

- 템플릿 원본: [Awesome-Apps-in-Toss/create-apps-in-toss](https://github.com/Awesome-Apps-in-Toss/create-apps-in-toss)
- `internal/dashboard`(관리 대시보드)는 포함, 샘플 미니앱·스캐폴더 패키지는 제거됨
- `apps/` 는 비어있는 상태로 시작 (`pnpm new-app <name>`으로 본인 미니앱 추가)
- `git init` + `upstream` remote 자동 등록
- `.barreleye-template.json`에 scaffold 시점 SHA 기록 → `pnpm update-template`으로 upstream 변경사항 동기화 가능

## 요구사항

- Node.js ≥ 20
- pnpm (없으면 의존성 설치 스킵)
- git (없으면 git init 스킵)
