# Commit Conventions

## 커밋 메시지 형식

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Type

| Type       | 설명                         |
| ---------- | ---------------------------- |
| `feat`     | 새 기능                      |
| `fix`      | 버그 수정                    |
| `docs`     | 문서 변경                    |
| `style`    | 코드 포맷팅 (기능 변경 없음) |
| `refactor` | 리팩토링                     |
| `test`     | 테스트 추가/수정             |
| `chore`    | 빌드, 설정 변경              |

## Scope

| Scope    | 설명                       |
| -------- | -------------------------- |
| `app`    | 특정 앱 (예: `app/sample`) |
| `ui`     | @barreleye/ui 패키지       |
| `config` | 설정 파일                  |
| `deps`   | 의존성                     |
| `ci`     | CI/CD                      |

## 예시

```bash
# 새 기능
feat(app/sample): add user profile page

# 버그 수정
fix(ui): correct button hover state

# 리팩토링
refactor(app/sample): extract user hooks

# 의존성 업데이트
chore(deps): update react to 18.3.1

# 문서
docs: update AGENTS.md with new conventions
```

## Breaking Changes

```bash
feat(ui)!: redesign Button component API

BREAKING CHANGE: Button now requires `variant` prop
```

## 커밋 팁

### 작은 단위로 커밋

```bash
# ✅ 좋음 - 각각 독립적인 변경
git commit -m "feat(ui): add Button component"
git commit -m "feat(ui): add Input component"

# ❌ 나쁨 - 너무 큰 단위
git commit -m "feat(ui): add all form components"
```

### WIP 커밋 금지

```bash
# ❌ main 브랜치에 금지
git commit -m "wip"
git commit -m "fix stuff"

# ✅ 명확한 메시지
git commit -m "fix(app/sample): resolve login redirect issue"
```

## Husky 자동 검사

커밋 시 자동으로 lint-staged 실행:

1. ESLint 검사 및 자동 수정
2. Prettier 포맷팅

실패 시 커밋 차단됨.
