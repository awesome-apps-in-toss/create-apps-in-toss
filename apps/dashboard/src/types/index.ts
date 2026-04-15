// ──────────────────────────────────────────
// Layer 1: 빌드 코드 (granite.config.ts, 읽기 전용)
// ──────────────────────────────────────────
export interface GraniteBrand {
  appName: string | null;
  displayName: string | null;
  primaryColor: string | null;
  icon: string | null;
}

// ──────────────────────────────────────────
// .meta-dashboard.json 스키마
// 모든 경로: 앱 폴더 기준 상대경로
//   이미지: ".meta/assets/logo.png"
//   PRD:   "docs/PRD.md"
//   UT:    "docs/user-test/report.md"
// ──────────────────────────────────────────
export interface AppConsoleConfig {
  version: number;
  // 기본 정보
  nameKo: string;
  nameEn: string;
  isGame: boolean;
  // 카테고리 (앱인토스 콘솔 기준, e.g. "생활 > 콘텐츠 > 테스트")
  aitCategory: string;
  // 노출 정보
  subtitle: string;
  description: string;
  keywords: string[];
  // 이미지 에셋 경로 (앱 폴더 기준 상대경로)
  logoPath: string | null; // 600×600
  thumbnailPath: string | null; // 가로형 1932×828 (assets/thumbnail-wide.png)
  screenshotPaths: string[]; // 정사각형 1000×1000 (assets/thumbnail-square.png) 등
  // 문서 경로 (앱 폴더 기준 상대경로)
  prdPath: string | null;
  utPath: string | null;
  // 파이프라인 진행 상태 (step 번호 → 상태)
  pipelineProgress: Record<number, PipelineStepStatus>;
  updatedAt: string;
}

// ──────────────────────────────────────────
// 파이프라인 진행 상태 (메타데이터 저장)
// ──────────────────────────────────────────
export interface PipelineStepStatus {
  completedAt: string;
  /** 이 단계에서 생성된 주요 산출물 경로 */
  artifacts?: Record<string, string>;
}

export const DEFAULT_CONSOLE_CONFIG: AppConsoleConfig = {
  version: 1,
  nameKo: '',
  nameEn: '',
  isGame: false,
  aitCategory: '',
  subtitle: '',
  description: '',
  keywords: [],
  logoPath: null,
  thumbnailPath: null,
  screenshotPaths: [],
  prdPath: null,
  utPath: null,
  pipelineProgress: {},
  updatedAt: '',
};

// ──────────────────────────────────────────
// 문서 존재 여부 (서버에서 경로 확인 후 채움)
// ──────────────────────────────────────────
export interface AppDoc {
  exists: boolean;
  path?: string;
  date?: string;
  /** 서버가 관례적 경로에서 자동 감지한 경우 true */
  autoDetected?: boolean;
}

export interface AppDocs {
  prd: AppDoc;
  ut: AppDoc;
}

// ──────────────────────────────────────────
// 통합 AppInfo (API 응답)
// ──────────────────────────────────────────
export interface AppInfo {
  folderName: string;
  packageName: string;
  version: string;
  description: string;
  dependencies: Record<string, string>;
  // Layer 1
  granite: GraniteBrand | null;
  // Layer 2
  console: AppConsoleConfig;
  // Layer 3
  docs: AppDocs;
  // 완성도 (레이어 가중치 적용)
  completion: number;
  completionDetail: {
    layer1: number; // 0–40
    layer2: number; // 0–30
    layer3: number; // 0–30
  };
}

// ──────────────────────────────────────────
// 스킬 분류
// ──────────────────────────────────────────

// ──────────────────────────────────────────
// 스킬 실행 모드
//   interactive: 대화형 — 웹에서 직접 실행 불가, CLI 명령어 복사 제공
//   automated:   자동 실행 가능 — 웹에서 바로 실행
// ──────────────────────────────────────────
export type SkillMode = 'interactive' | 'automated';

/** 7단계 순차 파이프라인 스킬 */
export const PIPELINE_SKILLS = [
  { step: 1, label: '기획', skill: 'ait-plan', description: '정책 검토 + PRD 생성', mode: 'interactive' as SkillMode, requires: null, requiresSteps: [] as readonly number[], produces: 'PRD 문서' },
  { step: 2, label: '에셋', skill: 'ait-assets', description: '이미지/텍스트 리소스 생성', mode: 'automated' as SkillMode, requires: null, requiresSteps: [] as readonly number[], produces: '로고, 썸네일, 스크린샷' },
  { step: 3, label: '스캐폴딩', skill: 'ait-scaffold', description: '프로젝트 생성 + 설정', mode: 'automated' as SkillMode, requires: 'PRD (Step 1)', requiresSteps: [1] as readonly number[], produces: '프로젝트 구조, granite.config.ts' },
  { step: 4, label: 'TDS', skill: 'ait-tds-setup', description: 'TDS 패키지 설치 + 검증', mode: 'automated' as SkillMode, requires: '프로젝트 (Step 3)', requiresSteps: [3] as readonly number[], produces: 'TDS 패키지, Provider 설정' },
  { step: 5, label: '구현', skill: 'ait-implement', description: '기획서 기반 기능 구현', mode: 'automated' as SkillMode, requires: 'PRD + TDS (Step 1, 4)', requiresSteps: [1, 4] as readonly number[], produces: '기능 코드, 라우팅' },
  { step: 6, label: '검수', skill: 'ait-review', description: '검수 체크리스트 점검', mode: 'automated' as SkillMode, requires: '구현 완료 (Step 5)', requiresSteps: [5] as readonly number[], produces: '검수 리포트' },
  { step: 7, label: '빌드', skill: 'ait-build', description: '빌드 + 콘솔 업로드 안내', mode: 'automated' as SkillMode, requires: '검수 통과 (Step 6)', requiresSteps: [6] as readonly number[], produces: '.ait 번들' },
] as const;

/** 독립 실행 유틸리티 스킬 */
export const UTILITY_SKILLS = [
  { skill: 'ait-meta', label: '메타 생성', description: '.meta-dashboard.json 자동 생성', mode: 'automated' as SkillMode, requiresData: 'PRD 또는 코드' },
  { skill: 'ait-ut', label: 'UT 시뮬레이션', description: '페르소나 기반 사용성 테스트', mode: 'automated' as SkillMode, requiresData: '구현된 앱' },
  { skill: 'ait-launch', label: '전체 실행', description: '7단계 파이프라인 순차 실행', mode: 'interactive' as SkillMode, requiresData: null },
] as const;

export type PipelineSkill = (typeof PIPELINE_SKILLS)[number]['skill'];
export type UtilitySkill = (typeof UTILITY_SKILLS)[number]['skill'];
export type AllowedSkill = PipelineSkill | UtilitySkill;

export interface SkillRunRequest {
  skill: AllowedSkill;
  app: string;
}
