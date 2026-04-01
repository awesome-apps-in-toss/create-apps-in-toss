# 의존성 관리

## 의존성 추가

### 특정 앱에만 추가

```bash
pnpm --filter @barreleye/my-app add lodash
pnpm --filter @barreleye/my-app add -D @types/lodash
```

### 공유 패키지에 추가

```bash
pnpm --filter @barreleye/ui add clsx
```

### 루트에 추가 (개발 도구)

```bash
pnpm add -D -w some-dev-tool
```

## workspace 의존성

내부 패키지 참조는 `workspace:*` 사용:

```json
{
  "dependencies": {
    "@barreleye/ui": "workspace:*"
  }
}
```

## 의존성 업데이트

```bash
# 모든 패키지 업데이트 확인
pnpm outdated -r

# 특정 패키지 업데이트
pnpm --filter @barreleye/my-app update react

# 전체 업데이트
pnpm update -r
```

## 의존성 규칙

### 허용

- `apps/*` → 외부 npm 패키지
- `apps/*` → `packages/*` (workspace)
- `packages/*` → 외부 npm 패키지

### 금지

- `apps/a` → `apps/b` (앱 간 의존 금지)
- `packages/*` → `apps/*` (역방향 금지)

## peer dependencies

공유 패키지에서 React 등은 peerDependencies로:

```json
// packages/ui/package.json
{
  "peerDependencies": {
    "react": "^18.0.0"
  }
}
```

## 트러블슈팅

### "Cannot find module" 에러

```bash
# node_modules 재설치
pnpm install

# 캐시 클리어 후 재설치
pnpm clean && pnpm install
```

### 버전 충돌

`.npmrc`에 설정:

```
auto-install-peers=true
strict-peer-dependencies=false
```
