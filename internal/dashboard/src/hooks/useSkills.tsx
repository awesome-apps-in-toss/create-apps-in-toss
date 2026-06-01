import { useState, useEffect, useMemo, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { DEMO_SKILLS } from '@/data/demoSkills';

const IS_STATIC = import.meta.env.PROD;

export type SkillMode = 'interactive' | 'automated';

export interface SkillInputDescriptor {
  key: string;
  /** 'text' | 'textarea' | 'file' | 'color' | 'select' ... 문자열 (서버가 그대로 전달) */
  type: string;
  required?: boolean;
  values?: string[];
}

export interface SkillOutputDescriptor {
  key: string;
  type: string;
  path?: string;
  required?: boolean;
}

/** 서버 `GET /api/skills`의 스킬 메타 (SKILL.md frontmatter 파생) */
export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  mode: SkillMode;
  step: number | null;
  label: string | null;
  produces: string | null;
  requires: string[];
  inputs: SkillInputDescriptor[];
  outputs: SkillOutputDescriptor[];
  idempotencyKey: string;
}

/** UI 렌더에 바로 쓸 수 있는 파이프라인 단계 */
export interface PipelineStep {
  step: number;
  skill: string;
  label: string;
  description: string;
  mode: SkillMode;
  /** 전제 스킬들의 `step` 번호 목록 (의존 그래프 해석 후) */
  requiresSteps: number[];
  /** "기획 + TDS (Step 1, 4)" 같은 사람용 문자열. 전제가 없으면 null */
  requires: string | null;
  produces: string;
}

interface SkillsContextValue {
  raw: SkillMeta[];
  pipeline: PipelineStep[];
  loading: boolean;
  error: string | null;
}

const SkillsContext = createContext<SkillsContextValue | null>(null);

function toPipelineSteps(skills: SkillMeta[]): PipelineStep[] {
  const bySkillId = new Map(skills.map((s) => [s.id, s]));

  return skills
    .filter((s): s is SkillMeta & { step: number; label: string; produces: string } =>
      s.step !== null && s.label !== null && s.produces !== null
    )
    .sort((a, b) => a.step - b.step)
    .map((s) => {
      const deps = s.requires
        .map((id) => bySkillId.get(id))
        .filter((d): d is SkillMeta => d != null && d.step !== null && d.label !== null);

      const requiresSteps = deps
        .map((d) => d.step)
        .filter((x): x is number => x !== null);

      let requires: string | null = null;
      if (deps.length === 1) {
        const d = deps[0]!;
        requires = `${d.label} (Step ${d.step})`;
      } else if (deps.length > 1) {
        const labels = deps.map((d) => d.label).join(' + ');
        const steps = deps.map((d) => d.step).join(', ');
        requires = `${labels} (Step ${steps})`;
      }

      return {
        step: s.step,
        skill: s.id,
        label: s.label,
        description: s.description,
        mode: s.mode,
        requiresSteps,
        requires,
        produces: s.produces,
      };
    });
}

export function SkillsProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<SkillMeta[]>(IS_STATIC ? DEMO_SKILLS : []);
  const [loading, setLoading] = useState(!IS_STATIC);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (IS_STATIC) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/skills');
        if (!res.ok) throw new Error(`스킬 목록을 불러오지 못했어요. (HTTP ${res.status})`);
        const data = (await res.json()) as { skills: SkillMeta[] };
        if (!cancelled) setRaw(data.skills ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.');
          // 서버 API 실패 시에도 UI가 완전히 비지 않도록 demo shape로 폴백
          setRaw(DEMO_SKILLS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const pipeline = useMemo(() => toPipelineSteps(raw), [raw]);

  const value = useMemo<SkillsContextValue>(
    () => ({ raw, pipeline, loading, error }),
    [raw, pipeline, loading, error]
  );

  return <SkillsContext.Provider value={value}>{children}</SkillsContext.Provider>;
}

export function useSkills() {
  const ctx = useContext(SkillsContext);
  if (!ctx) throw new Error('useSkills must be used within SkillsProvider');
  return ctx;
}
