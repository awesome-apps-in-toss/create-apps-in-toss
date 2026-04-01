# Common Errors

## TypeScript Errors

### Module not found: '@/\*'

**증상**

```
Cannot find module '@/components/Button'
```

**원인**: Path alias가 Vite에서 인식되지 않음

**해결**

```bash
# vite-tsconfig-paths 설치 확인
pnpm --filter @barreleye/my-app add -D vite-tsconfig-paths
```

```typescript
// vite.config.ts
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
});
```

---

### Type 'X' is not assignable to type 'Y'

**증상**

```
Type 'string | undefined' is not assignable to type 'string'
```

**해결**: Optional 값 처리

```typescript
// ❌
const name: string = user.name;

// ✅
const name = user.name ?? 'Unknown';
// 또는
if (user.name) {
  const name: string = user.name;
}
```

---

## Build Errors

### collect-package-version: Could not resolve "@barreleye/eslint-config"

**증상**

```
ERROR: [plugin: collect-package-version] Could not resolve "@barreleye/eslint-config"
```

**원인**: `@barreleye/eslint-config`의 `exports` 필드에 `./package.json`과 루트 export(`.`)가 없어서 granite/ait build의 esbuild 플러그인이 resolve에 실패

**해결**: `packages/eslint-config/package.json`의 `exports`에 추가

```json
{
  "exports": {
    ".": "./base.js",
    "./base": "./base.js",
    "./react": "./react.js",
    "./package.json": "./package.json"
  }
}
```

---

### 시뮬레이터/실기기에서 "Loading from Metro" 무한 로딩

**증상**: `granite dev` 실행 후 시뮬레이터 또는 실기기에서 "Loading from Metro..."에서 멈춤

**원인**: `granite.config.ts`의 `web.port`와 `vite.config.ts`의 `server.port`가 불일치

**해결**: 두 파일의 포트를 동일하게 설정

```typescript
// granite.config.ts
web: { port: 5173, ... }

// vite.config.ts
server: { port: 5173 }
```

실기기 테스트 시에는 추가로 `web.host`를 네트워크 IP로, `dev` 커맨드에 `--host` 옵션 추가 필요.

---

### granite.config.ts 타입 에러

**증상**

```
error TS2742: The inferred type of 'default' cannot be named
```

**원인**: tsconfig.json에 granite.config.ts가 포함됨

**해결**: tsconfig.json에서 제외

```json
{
  "include": ["src", "vite.config.ts"],
  "exclude": ["granite.config.ts"]
}
```

---

### Turborepo cache miss

**증상**: 변경 없는데 캐시 미스 발생

**해결**

```bash
# Turbo 캐시 클리어
rm -rf .turbo
pnpm build
```

---

## Runtime Errors

### "Root element not found"

**증상**

```
Error: Root element not found
```

**원인**: HTML에 #root 요소 없음

**해결**: index.html 확인

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

---

### TanStack Query: No QueryClient

**증상**

```
No QueryClient set, use QueryClientProvider
```

**원인**: QueryProvider가 앱을 감싸지 않음

**해결**: main.tsx 확인

```tsx
<QueryProvider>
  <BrowserRouter>
    <App />
  </BrowserRouter>
</QueryProvider>
```

---

## Dependency Errors

### Peer dependency warnings

**증상**

```
WARN  unmet peer react@18.2.0: found 18.3.1
```

**해결**: 대부분 무시 가능. 심각한 경우:

```bash
# .npmrc
auto-install-peers=true
strict-peer-dependencies=false
```

---

### workspace:\* resolution failed

**증상**

```
ERR_PNPM_NO_MATCHING_VERSION  No matching version found
```

**해결**

```bash
# 패키지 이름 확인 후 재설치
pnpm install
```

---

## ESLint Errors

### Parsing error: Cannot find module

**증상**

```
Parsing error: Cannot find module '@barreleye/eslint-config'
```

**해결**

```bash
pnpm install
# 또는 ESLint 캐시 클리어
rm -rf node_modules/.cache
```

---

## Git/Husky Errors

### pre-commit hook failed

**증상**: 커밋 시 lint-staged 실패

**해결**

```bash
# 먼저 수동으로 수정
pnpm lint --fix
pnpm format

# 그래도 실패시 (긴급 상황만)
git commit --no-verify -m "message"
```

---

## 해결 안 될 때

1. `pnpm clean && pnpm install` 실행
2. IDE/에디터 재시작
3. `node_modules` 삭제 후 재설치
4. 에러 메시지 전체를 검색
