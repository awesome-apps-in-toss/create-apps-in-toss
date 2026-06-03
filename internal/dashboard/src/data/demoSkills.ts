import type { SkillMeta } from '@/hooks/useSkills';

// GitHub Pages demo fallback — 서버(`GET /api/skills`)가 없을 때 쓰는 8단계 기본 shape.
// 실제 로컬 개발에서는 서버가 SKILL.md frontmatter 를 읽어 내려주므로 항상 서버 응답이 우선.
//
// ⚠️ 이 값들은 `.claude/skills/<id>/SKILL.md` frontmatter 와 반드시 일치해야 한다.
//    (step / label / produces / mode / requires)
//    드리프트 방지를 위해 `pnpm --filter @barreleye/dashboard validate` 가 교차검증한다.
export const DEMO_SKILLS: SkillMeta[] = [
  { id: 'ait-plan', name: 'ait-plan', description: '정책 검토 + PRD 생성', mode: 'interactive', step: 1, label: '기획', produces: 'PRD 문서', requires: [], inputs: [], outputs: [], idempotencyKey: 'ait-plan' },
  { id: 'ait-assets', name: 'ait-assets', description: '로고 + 가로형 썸네일 + 텍스트 리소스 점검', mode: 'interactive', step: 2, label: '에셋', produces: '로고, 가로형 썸네일', requires: [], inputs: [], outputs: [], idempotencyKey: 'ait-assets' },
  { id: 'ait-scaffold', name: 'ait-scaffold', description: '프로젝트 틀 생성 + 설정', mode: 'automated', step: 3, label: '프로젝트 틀 만들기', produces: '최소 앱 구조 + 선택한 추가 기능', requires: ['ait-plan'], inputs: [], outputs: [], idempotencyKey: 'ait-scaffold' },
  { id: 'ait-tds-setup', name: 'ait-tds-setup', description: 'TDS 패키지 설치 + 검증', mode: 'automated', step: 4, label: '토스 스타일 UI', produces: 'TDS 패키지 + Provider 설정', requires: ['ait-scaffold'], inputs: [], outputs: [], idempotencyKey: 'ait-tds-setup' },
  { id: 'ait-implement', name: 'ait-implement', description: '기획서 기반 기능 구현', mode: 'automated', step: 5, label: '구현', produces: '기능 코드, 라우팅', requires: ['ait-plan', 'ait-tds-setup'], inputs: [], outputs: [], idempotencyKey: 'ait-implement' },
  { id: 'ait-screenshots', name: 'ait-screenshots', description: 'dev 서버 기동 후 세로 스크린샷 3장 캡처', mode: 'interactive', step: 6, label: '스크린샷', produces: '세로형 스크린샷 3장', requires: ['ait-implement'], inputs: [], outputs: [], idempotencyKey: 'ait-screenshots' },
  { id: 'ait-review', name: 'ait-review', description: '검수 체크리스트 점검', mode: 'automated', step: 7, label: '검수', produces: '검수 리포트', requires: ['ait-screenshots'], inputs: [], outputs: [], idempotencyKey: 'ait-review' },
  { id: 'ait-build', name: 'ait-build', description: '빌드 + 콘솔 업로드 안내', mode: 'automated', step: 8, label: '빌드', produces: '.ait 번들', requires: ['ait-review'], inputs: [], outputs: [], idempotencyKey: 'ait-build' },
];
