import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, Users, Palette, Link as LinkIcon, FileText } from 'lucide-react';
import { useSkills } from '@/hooks/useSkills';
import type { SkillInputDescriptor } from '@/hooks/useSkills';

interface SkillInputFormProps {
  skillId: string;
  /** 값이 바뀔 때마다 최신 스냅샷 전달. 구조화된 input + 조합된 prompt string. */
  onChange?: (state: SkillInputState) => void;
  /** 폼의 현재 값 (controlled). 미지정 시 내부 state. */
  value?: SkillInputState;
  disabled?: boolean;
}

export interface SkillInputState {
  /** key → 값 (textarea 는 string, select 는 string, file 은 파일명). */
  values: Record<string, string>;
  /** 조합된 프롬프트 텍스트 (필수/선택 구분해서 정형화). */
  prompt: string;
  /** 필수 필드가 비어있는지. */
  missingRequired: boolean;
}

/**
 * SKILL.md frontmatter 의 `inputs` 선언을 읽어 동적으로 입력 폼을 렌더.
 *   - type=text 는 한줄 input, key=idea 는 textarea 로 강제 (장문).
 *   - type=select + values 는 <select>.
 *   - type=color 는 color picker.
 *   - 알 수 없는 type 은 그냥 text.
 *
 * 조합된 prompt 는 `key: value` 형식으로 직렬화해 initialPrompt 로 전달 가능.
 */
export default function SkillInputForm({
  skillId,
  onChange,
  value,
  disabled = false,
}: SkillInputFormProps) {
  const { raw, loading } = useSkills();
  const meta = useMemo(() => raw.find((s) => s.id === skillId), [raw, skillId]);
  const [localState, setLocalState] = useState<Record<string, string>>({});
  const values = value?.values ?? localState;

  const inputs = meta?.inputs ?? [];

  function setValue(key: string, v: string) {
    const next = { ...values, [key]: v };
    if (value === undefined) setLocalState(next);

    const missingRequired = inputs.some(
      (inp: SkillInputDescriptor) => inp.required && !(next[inp.key] ?? '').trim()
    );
    const prompt = buildPrompt(next, inputs);
    onChange?.({ values: next, prompt, missingRequired });
  }

  // controlled 모드(value prop 제공) 에서는 사용자가 아무 필드도 건드리지 않으면
  // setValue 가 호출되지 않아 부모의 missingRequired 가 초기값 그대로 남는다.
  // → 필수 입력이 비어있어도 "시작" 버튼이 enable 되는 우회가 가능.
  // inputs 선언이 들어올 때(스킬 전환 포함) 현재 values 로 한번 재계산해 부모에 통지.
  useEffect(() => {
    if (!meta || inputs.length === 0) return;
    const missingRequired = inputs.some(
      (inp) => inp.required && !(values[inp.key] ?? '').trim()
    );
    const prompt = buildPrompt(values, inputs);
    onChange?.({ values, prompt, missingRequired });
    // values/onChange 는 고의로 deps 에서 제외: 편집 흐름은 setValue 가 담당하고,
    // 이 effect 는 inputs 선언이 바뀌는 순간(mount 혹은 다른 skill 로 전환) 만 재통지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId, meta, inputs.length]);

  if (loading || !meta) return null;
  if (inputs.length === 0) return null;

  return (
    <div className="skill-input-form">
      {inputs.map((input: SkillInputDescriptor) => (
        <SkillInputField
          key={input.key}
          input={input}
          value={values[input.key] ?? ''}
          disabled={disabled}
          onChange={(v) => setValue(input.key, v)}
        />
      ))}
    </div>
  );
}

function SkillInputField({
  input,
  value,
  onChange,
  disabled,
}: {
  input: SkillInputDescriptor;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const { label, placeholder, icon } = describeInput(input);
  const inputId = `skill-input-${input.key}`;
  const hintId = `${inputId}-hint`;
  const isTextArea = input.type === 'textarea' || input.key === 'idea' || input.key === 'description';
  const isSelect = input.type === 'select' && input.values && input.values.length > 0;
  const isColor = input.type === 'color' || /color/i.test(input.key);
  const isFile = input.type === 'file';

  return (
    <div className="skill-input-field">
      <label className="skill-input-label" htmlFor={inputId}>
        {icon}
        {label}
        {input.required && <span className="skill-input-required">*</span>}
      </label>
      <span id={hintId} className="skill-input-hint">
        {placeholder}
      </span>
      {isFile ? (
        <input
          id={inputId}
          type="text"
          className="skill-input-control"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          aria-required={input.required}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : isSelect ? (
        <select
          id={inputId}
          className="skill-input-control"
          value={value}
          disabled={disabled}
          aria-required={input.required}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {input.values!.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : isColor ? (
        <div className="skill-input-color-wrap">
          <input
            id={inputId}
            type="color"
            className="skill-input-color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#3182F6'}
            disabled={disabled}
            aria-required={input.required}
            aria-describedby={hintId}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            className="skill-input-control"
            value={value}
            placeholder="#RRGGBB"
            disabled={disabled}
            aria-label={`${label} hex value`}
            aria-required={input.required}
            aria-describedby={hintId}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ) : isTextArea ? (
        <textarea
          id={inputId}
          rows={3}
          className="skill-input-control"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          aria-required={input.required}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={inputId}
          type="text"
          className="skill-input-control"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          aria-required={input.required}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

interface InputDescription {
  label: string;
  placeholder: string;
  icon: React.ReactNode;
}

/** key/name 에 따라 사람 친화 라벨/플레이스홀더/아이콘 매핑. */
function describeInput(input: SkillInputDescriptor): InputDescription {
  switch (input.key) {
    case 'idea':
      return {
        label: '어떤 미니앱을 만들고 싶나요?',
        placeholder: '예: 친구들과 여행 일정을 공유하고 투표할 수 있는 미니앱',
        icon: <Lightbulb size={14} strokeWidth={1.75} />,
      };
    case 'target':
    case 'targetUser':
    case 'audience':
      return {
        label: '타깃 사용자',
        placeholder: '예: 20-30대 직장인 여행러',
        icon: <Users size={14} strokeWidth={1.75} />,
      };
    case 'color':
    case 'primaryColor':
    case 'brandColor':
      return {
        label: '브랜드 컬러',
        placeholder: '#3182F6',
        icon: <Palette size={14} strokeWidth={1.75} />,
      };
    case 'references':
    case 'inspiration':
      return {
        label: '참고 서비스 / 영감',
        placeholder: '예: 노션, 캘린들리 등',
        icon: <LinkIcon size={14} strokeWidth={1.75} />,
      };
    case 'planningDoc':
      return {
        label: '기획 문서 경로 (선택)',
        placeholder: 'docs/planning.md',
        icon: <FileText size={14} strokeWidth={1.75} />,
      };
    default:
      return {
        label: humanizeKey(input.key),
        placeholder: input.required ? '(필수 입력)' : '(선택 입력)',
        icon: <FileText size={14} strokeWidth={1.75} />,
      };
  }
}

/** camelCase / kebab-case / snake_case 키를 읽기 좋은 한 덩어리로. 디폴트 라벨용. */
function humanizeKey(key: string): string {
  return key
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** 구조화 값들을 `key: value` 여러 줄로 직렬화. 비어있는 값은 스킵. */
function buildPrompt(values: Record<string, string>, inputs: SkillInputDescriptor[]): string {
  const lines: string[] = [];
  for (const inp of inputs) {
    const v = (values[inp.key] ?? '').trim();
    if (!v) continue;
    const label = describeInput(inp).label;
    lines.push(`${label}: ${v}`);
  }
  return lines.join('\n');
}
