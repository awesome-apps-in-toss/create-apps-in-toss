# Code Style Guide

## 파일 네이밍

| 타입     | 컨벤션                | 예시                         |
| -------- | --------------------- | ---------------------------- |
| 컴포넌트 | PascalCase            | `Button.tsx`, `UserCard.tsx` |
| 훅       | camelCase, use prefix | `useUser.ts`, `useAuth.ts`   |
| 유틸리티 | camelCase             | `format.ts`, `validate.ts`   |
| 타입     | camelCase             | `user.ts`, `api.ts`          |
| 상수     | camelCase             | `config.ts`, `routes.ts`     |

## 컴포넌트

### Named Export 권장

```typescript
// ✅ 권장
export function Button() { ... }

// ❌ 지양 (리팩토링 어려움)
export default function Button() { ... }
```

### Props 인터페이스

```typescript
// ✅ 컴포넌트 바로 위에 정의
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export function Button({ variant = 'primary', children }: ButtonProps) {
  return <button className={variant}>{children}</button>;
}
```

### 이벤트 핸들러

```typescript
// ✅ handle prefix
function handleClick() { ... }
function handleSubmit() { ... }

// Props로 전달 시 on prefix
<Button onClick={handleClick} />
```

## Import 순서

```typescript
// 1. React
import { useState } from 'react';

// 2. 외부 라이브러리
import { useQuery } from '@tanstack/react-query';

// 3. 내부 패키지 (@barreleye/*)
import { Button } from '@barreleye/ui';

// 4. 로컬 모듈 (@/*)
import { useUser } from '@/hooks/useUser';
import { formatDate } from '@/utils/format';

// 5. 타입 (type import)
import type { User } from '@/types/user';

// 6. 스타일
import './Button.css';
```

## TypeScript

### 타입 vs 인터페이스

```typescript
// 객체 형태: interface
interface User {
  id: string;
  name: string;
}

// 유니온, 튜플, 프리미티브: type
type Status = 'idle' | 'loading' | 'success' | 'error';
type Coordinates = [number, number];
```

### type import

```typescript
// ✅ 타입만 import할 때
import type { User } from '@/types/user';

// ✅ 값과 타입 함께
import { fetchUser, type User } from '@/api/user';
```

### 제네릭 네이밍

```typescript
// ✅ 의미있는 이름
function map<TInput, TOutput>(arr: TInput[], fn: (item: TInput) => TOutput): TOutput[];

// ❌ 단순 T, U
function map<T, U>(arr: T[], fn: (item: T) => U): U[];
```

## 금지 패턴

### any 사용 금지

```typescript
// ❌
const data: any = response;

// ✅
const data: unknown = response;
if (isUser(data)) { ... }
```

### 인라인 스타일 지양

```typescript
// ❌
<div style={{ marginTop: 10 }}>

// ✅ CSS 클래스 또는 TDS 컴포넌트
<div className="mt-10">
```

### 매직 넘버 금지

```typescript
// ❌
if (count > 10) { ... }

// ✅
const MAX_ITEMS = 10;
if (count > MAX_ITEMS) { ... }
```
