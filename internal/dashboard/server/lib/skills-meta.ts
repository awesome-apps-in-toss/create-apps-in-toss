import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';

export const SKILLS_DIR: string = path.resolve(process.cwd(), '../../.claude/skills');

export interface SkillInputDescriptor {
  key: string;
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

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  mode: 'interactive' | 'automated';
  step: number | null;
  /** 파이프라인 단계의 짧은 한국어 라벨. utility 스킬에서는 null. */
  label: string | null;
  /** 이 스킬이 만들어내는 산출물에 대한 짧은 설명. utility에서는 null. */
  produces: string | null;
  /** 의존 스킬 id 목록 (requires 그래프). */
  requires: string[];
  inputs: SkillInputDescriptor[];
  outputs: SkillOutputDescriptor[];
  idempotencyKey: string;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  );
}

function normalizeMode(value: unknown): 'interactive' | 'automated' {
  return value === 'interactive' ? 'interactive' : 'automated';
}

function normalizeStep(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeInputs(value: unknown): SkillInputDescriptor[] {
  return asObjectArray(value).map((entry) => ({
    key: asString(entry['key'], ''),
    type: asString(entry['type'], 'text'),
    required: entry['required'] === true,
    ...(Array.isArray(entry['values']) && { values: asStringArray(entry['values']) }),
  }));
}

function normalizeOutputs(value: unknown): SkillOutputDescriptor[] {
  return asObjectArray(value).map((entry) => {
    const out: SkillOutputDescriptor = {
      key: asString(entry['key'], ''),
      type: asString(entry['type'], 'text'),
    };
    if (typeof entry['path'] === 'string') out.path = entry['path'];
    if (entry['required'] === true) out.required = true;
    return out;
  });
}

export async function readSkillMeta(skillId: string): Promise<SkillMeta | null> {
  const skillPath = path.join(SKILLS_DIR, skillId, 'SKILL.md');
  let raw: string;
  try {
    raw = await fs.readFile(skillPath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    console.warn(`[skills] frontmatter parse failed: ${skillId}`, err);
    return null;
  }

  const data = parsed.data as Record<string, unknown>;
  const name = asString(data['name'], skillId);
  const description = asString(data['description'], '');

  return {
    id: skillId,
    name,
    description,
    mode: normalizeMode(data['mode']),
    step: normalizeStep(data['step']),
    label: asNullableString(data['label']),
    produces: asNullableString(data['produces']),
    requires: asStringArray(data['requires']),
    inputs: normalizeInputs(data['inputs']),
    outputs: normalizeOutputs(data['outputs']),
    idempotencyKey: asString(data['idempotencyKey'], skillId),
  };
}

/** 디렉터리 기준 모든 스킬 메타를 읽어 step 오름차순으로 정렬해 반환. */
export async function listSkillMetas(): Promise<SkillMeta[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(SKILLS_DIR);
  } catch {
    return [];
  }

  const metas: SkillMeta[] = [];
  for (const entry of entries) {
    const stat = await fs.stat(path.join(SKILLS_DIR, entry)).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const meta = await readSkillMeta(entry);
    if (meta) metas.push(meta);
  }

  metas.sort((a, b) => {
    if (a.step !== null && b.step !== null) return a.step - b.step;
    if (a.step !== null) return -1;
    if (b.step !== null) return 1;
    return a.id.localeCompare(b.id);
  });

  return metas;
}
