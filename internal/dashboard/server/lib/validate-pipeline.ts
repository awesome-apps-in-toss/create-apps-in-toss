// 파이프라인 단계 세팅 교차검증 (순수 함수 모음)
//
// 세 곳의 "단계 설정"이 서로 어긋나지 않는지 스킬별로 대조한다.
//   1) `.claude/skills/<id>/SKILL.md` frontmatter (런타임 소스 오브 트루스)
//   2) `src/data/demoSkills.ts` (GitHub Pages 데모 fallback)
//   3) 각 앱의 `.meta-dashboard.json` 진행 상태 + 산출물 경로
//
// IO 는 하지 않는다. 데이터를 받아 Issue[] 만 돌려주므로 CLI/서버 어디서든 재사용 가능.

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  /** 'skill:<id>' | 'graph' | 'app:<folder>' */
  scope: string;
  message: string;
}

/** SkillMeta(서버/프론트 공통) 와 데모 항목이 모두 만족하는 최소 형상 */
export interface ValidatableSkill {
  id: string;
  step: number | null;
  label: string | null;
  produces: string | null;
  requires: string[];
  mode: 'interactive' | 'automated';
  description: string;
}

/** AppConsoleConfig 가 만족하는 최소 형상 */
export interface ValidatableConsole {
  logoPath: string | null;
  thumbnailPath: string | null;
  screenshotPaths: string[];
  prdPath: string | null;
  utPath: string | null;
}

function err(scope: string, message: string): Issue {
  return { severity: 'error', scope, message };
}
function warn(scope: string, message: string): Issue {
  return { severity: 'warning', scope, message };
}

function sameArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** 파이프라인 단계(step != null)만, step 오름차순으로 */
function pipelineSkills(skills: ValidatableSkill[]): (ValidatableSkill & { step: number })[] {
  return skills
    .filter((s): s is ValidatableSkill & { step: number } => s.step !== null)
    .sort((a, b) => a.step - b.step);
}

// ── 1) SKILL.md ↔ DEMO_SKILLS 교차검증 ───────────────────────────
// 비교 대상: step / label / produces / mode / requires.
// description 은 데모용 축약 문구를 허용하므로 비교하지 않는다.
export function crossCheckDemoSkills(
  metas: ValidatableSkill[],
  demo: ValidatableSkill[]
): Issue[] {
  const issues: Issue[] = [];
  const metaById = new Map(metas.map((m) => [m.id, m]));
  const demoById = new Map(demo.map((d) => [d.id, d]));

  // 파이프라인 스킬은 데모에 반드시 같은 값으로 존재해야 한다.
  for (const meta of pipelineSkills(metas)) {
    const d = demoById.get(meta.id);
    if (!d) {
      issues.push(err(`skill:${meta.id}`, `DEMO_SKILLS 에 항목이 없음 (SKILL.md step ${meta.step})`));
      continue;
    }
    if (d.step !== meta.step) {
      issues.push(err(`skill:${meta.id}`, `step 불일치: DEMO ${String(d.step)} ≠ SKILL.md ${meta.step}`));
    }
    if (d.label !== meta.label) {
      issues.push(err(`skill:${meta.id}`, `label 불일치: DEMO '${String(d.label)}' ≠ SKILL.md '${String(meta.label)}'`));
    }
    if (d.produces !== meta.produces) {
      issues.push(err(`skill:${meta.id}`, `produces 불일치: DEMO '${String(d.produces)}' ≠ SKILL.md '${String(meta.produces)}'`));
    }
    if (d.mode !== meta.mode) {
      issues.push(err(`skill:${meta.id}`, `mode 불일치: DEMO '${d.mode}' ≠ SKILL.md '${meta.mode}'`));
    }
    if (!sameArray(d.requires, meta.requires)) {
      issues.push(
        err(`skill:${meta.id}`, `requires 불일치: DEMO [${d.requires.join(', ')}] ≠ SKILL.md [${meta.requires.join(', ')}]`)
      );
    }
  }

  // 데모에만 있고 SKILL.md 에는 없는 항목 (오래된 잔존)
  for (const d of demo) {
    if (!metaById.has(d.id)) {
      issues.push(err(`skill:${d.id}`, `DEMO_SKILLS 에만 있고 SKILL.md 에는 없는 스킬`));
    }
  }

  return issues;
}

// ── 2) 의존성 그래프 무결성 ──────────────────────────────────────
// requires 가 실재하는지, 전제 step 이 현재보다 앞서는지, step 이 1..N 으로 연속인지.
export function checkDependencyGraph(metas: ValidatableSkill[]): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(metas.map((m) => [m.id, m]));
  const steps = pipelineSkills(metas);

  // step 중복
  const seenSteps = new Map<number, string>();
  for (const s of steps) {
    const prev = seenSteps.get(s.step);
    if (prev) {
      issues.push(err('graph', `step ${s.step} 중복: '${prev}' 와 '${s.id}'`));
    } else {
      seenSteps.set(s.step, s.id);
    }
  }

  // requires 검증
  for (const s of steps) {
    for (const reqId of s.requires) {
      const dep = byId.get(reqId);
      if (!dep) {
        issues.push(err(`skill:${s.id}`, `requires 가 존재하지 않는 스킬 '${reqId}' 를 가리킴`));
        continue;
      }
      if (dep.step === null) {
        issues.push(warn(`skill:${s.id}`, `전제 '${reqId}' 가 파이프라인 단계가 아님 (step 없음)`));
        continue;
      }
      if (dep.step >= s.step) {
        issues.push(
          err(`skill:${s.id}`, `전제 '${reqId}'(step ${dep.step}) 가 현재(step ${s.step}) 이후이거나 같음 — 순서 위반`)
        );
      }
    }
  }

  // step 연속성 (1..N)
  const stepNums = steps.map((s) => s.step);
  for (let i = 0; i < stepNums.length; i++) {
    const expected = i + 1;
    if (stepNums[i] !== expected) {
      issues.push(warn('graph', `step 번호가 1..N 으로 연속이지 않음 (기대 ${expected}, 실제 ${String(stepNums[i])})`));
      break;
    }
  }

  return issues;
}

// ── 3-a) 앱 진행 상태가 의존성 순서를 지키는지 ───────────────────
// 어떤 단계가 완료로 감지됐는데 그 전제 단계가 완료 목록에 없으면 경고.
// (예: granite.config.ts 존재로 스캐폴딩은 완료지만 PRD 가 없어 기획이 비어 있음)
export function checkProgressDependencies(
  folderName: string,
  progress: Record<number, unknown>,
  metas: ValidatableSkill[]
): Issue[] {
  const issues: Issue[] = [];
  const byStep = new Map(pipelineSkills(metas).map((s) => [s.step, s]));
  const byId = new Map(metas.map((m) => [m.id, m]));

  const doneSteps = new Set(
    Object.keys(progress)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
  );

  for (const stepNum of [...doneSteps].sort((a, b) => a - b)) {
    const skill = byStep.get(stepNum);
    if (!skill) continue;
    for (const reqId of skill.requires) {
      const dep = byId.get(reqId);
      if (!dep || dep.step === null) continue;
      if (!doneSteps.has(dep.step)) {
        issues.push(
          warn(
            `app:${folderName}`,
            `step ${stepNum}(${String(skill.label)}) 완료로 감지됐지만 전제 step ${dep.step}(${String(dep.label)}) 미완료`
          )
        );
      }
    }
  }

  return issues;
}

// ── 3-b) meta 의 경로 필드가 실제 파일을 가리키는지 ──────────────
// exists(relPath) 는 호출자(CLI)가 fs 로 채워 전달한다.
export function checkAppPaths(
  folderName: string,
  console_: ValidatableConsole,
  exists: (relPath: string) => boolean
): Issue[] {
  const issues: Issue[] = [];
  const single: { field: string; value: string | null }[] = [
    { field: 'logoPath', value: console_.logoPath },
    { field: 'thumbnailPath', value: console_.thumbnailPath },
    { field: 'prdPath', value: console_.prdPath },
    { field: 'utPath', value: console_.utPath },
  ];
  for (const { field, value } of single) {
    if (value && !exists(value)) {
      issues.push(err(`app:${folderName}`, `${field} '${value}' 가 가리키는 파일이 없음`));
    }
  }
  console_.screenshotPaths.forEach((p, i) => {
    if (p && !exists(p)) {
      issues.push(err(`app:${folderName}`, `screenshotPaths[${i}] '${p}' 가 가리키는 파일이 없음`));
    }
  });
  return issues;
}
