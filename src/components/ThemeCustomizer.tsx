import { useEffect, useState } from 'react';
import { AlertTriangle, Palette, Rows3, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import type { Density, DividerStyle, ShadowIntensity, ThemeColors, ThemeTokens } from '@/types/schema';
import { Slider } from './ui/Slider';
import { Segmented } from './ui/Segmented';
import { Label } from './ui/Input';
import { Section } from './ui/Section';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/Accordion';
import { contrastRatio, shadowValue } from '@/utils/theme';
import { cn } from '@/lib/cn';

export const PALETTES: { name: string; colors: ThemeColors }[] = [
  { name: 'Аметист', colors: { primary: '#6d28d9', background: '#f6f5fb', surface: '#ffffff', accent: '#f59e0b', text: '#1e1b2e' } },
  { name: 'Неон', colors: { primary: '#22d3ee', background: '#0b0f1a', surface: '#131a2b', accent: '#f43f5e', text: '#e6edf7' } },
  { name: 'Таверна', colors: { primary: '#b45309', background: '#fbf6ee', surface: '#fffdf8', accent: '#15803d', text: '#3b2a1a' } },
  { name: 'Газета', colors: { primary: '#111827', background: '#fafafa', surface: '#ffffff', accent: '#ef4444', text: '#111827' } },
  { name: 'Лес', colors: { primary: '#047857', background: '#f1f7f4', surface: '#ffffff', accent: '#eab308', text: '#0f2a1f' } },
  { name: 'Океан', colors: { primary: '#2563eb', background: '#eff4ff', surface: '#ffffff', accent: '#06b6d4', text: '#0f1b3d' } },
  { name: 'Закат', colors: { primary: '#e11d48', background: '#fff5f5', surface: '#ffffff', accent: '#fb923c', text: '#3a1220' } },
  { name: 'Полночь', colors: { primary: '#a78bfa', background: '#0f0d1a', surface: '#1a1730', accent: '#34d399', text: '#ece9fb' } },
];

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  primary: 'Основной',
  accent: 'Акцент',
  background: 'Фон',
  surface: 'Карточки',
  text: 'Текст',
};

const SHADOW_OPTIONS: { value: ShadowIntensity; label: string }[] = [
  { value: 'none', label: 'Нет' },
  { value: 'soft', label: 'Мягкая' },
  { value: 'medium', label: 'Средняя' },
  { value: 'colored', label: 'Цветная' },
];

const DIVIDER_OPTIONS: { value: DividerStyle; label: string }[] = [
  { value: 'solid', label: 'Линия' },
  { value: 'dashed', label: 'Пунктир' },
  { value: 'gradient', label: 'Градиент' },
  { value: 'minimal', label: 'Минимал' },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Плотно' },
  { value: 'comfortable', label: 'Удобно' },
  { value: 'spacious', label: 'Просторно' },
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function ColorField({ name, value, onChange }: { name: keyof ThemeColors; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const id = `color-${name}`;
  return (
    <div className="flex items-center gap-2.5">
      <label
        className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-zinc-700 shadow-inner"
        style={{ background: value }}
        title={`Выбрать: ${COLOR_LABELS[name]}`}
      >
        <input type="color" value={value.length === 4 ? `#${value.slice(1).split('').map((c) => c + c).join('')}` : value}
          onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={COLOR_LABELS[name]} />
      </label>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-xs font-medium text-zinc-400">{COLOR_LABELS[name]}</label>
        <input
          id={id}
          value={draft}
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          onBlur={() => setDraft(value)}
          className={cn(
            'w-full bg-transparent font-mono text-sm uppercase text-zinc-100 focus:outline-none',
            !HEX.test(draft) && 'text-rose-400',
          )}
        />
      </div>
    </div>
  );
}

function PaletteGrid({ current, onPick }: { current: ThemeColors; onPick: (c: ThemeColors) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {PALETTES.map((p) => {
        const active = p.colors.primary === current.primary && p.colors.background === current.background;
        return (
          <button
            key={p.name}
            type="button"
            onClick={() => onPick(p.colors)}
            className={cn(
              'group rounded-xl border p-1.5 text-left transition-colors',
              active ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-800 hover:border-zinc-600',
            )}
            title={p.name}
          >
            <div className="flex h-9 overflow-hidden rounded-lg" style={{ background: p.colors.background }}>
              <div className="m-1.5 flex-1 rounded" style={{ background: p.colors.primary }} />
              <div className="my-1.5 mr-1.5 w-2.5 rounded" style={{ background: p.colors.accent }} />
            </div>
            <div className="mt-1 truncate px-0.5 text-[11px] text-zinc-400 group-hover:text-zinc-200">{p.name}</div>
          </button>
        );
      })}
    </div>
  );
}

function ShadowPicker({ theme, onChange }: { theme: ThemeTokens; onChange: (v: ShadowIntensity) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {SHADOW_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl border px-1 pb-2 pt-3 text-[11px] transition-colors',
            theme.shadowIntensity === o.value ? 'border-violet-500 bg-violet-500/10 text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600',
          )}
        >
          <span className="h-7 w-10 rounded-md bg-white" style={{ boxShadow: shadowValue({ ...theme, shadowIntensity: o.value }) }} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DividerPicker({ value, primary, accent, onChange }: { value: DividerStyle; primary: string; accent: string; onChange: (v: DividerStyle) => void }) {
  const sample = (style: DividerStyle) => {
    switch (style) {
      case 'solid':
        return <span className="block h-0 w-full border-t border-zinc-400" />;
      case 'dashed':
        return <span className="block h-0 w-full border-t border-dashed border-zinc-400" />;
      case 'gradient':
        return <span className="block h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${primary}, ${accent}, transparent)` }} />;
      case 'minimal':
        return <span className="block h-[3px] w-4 rounded" style={{ background: primary }} />;
    }
  };
  return (
    <div className="grid grid-cols-4 gap-2">
      {DIVIDER_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-col items-center gap-2.5 rounded-xl border px-2 pb-2 pt-4 text-[11px] transition-colors',
            value === o.value ? 'border-violet-500 bg-violet-500/10 text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600',
          )}
        >
          <span className="flex h-2 w-full items-center justify-start">{sample(o.value)}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ContrastWarnings({ colors }: { colors: ThemeColors }) {
  const checks = [
    { label: 'Текст на фоне', ratio: contrastRatio(colors.text, colors.background) },
    { label: 'Текст на карточках', ratio: contrastRatio(colors.text, colors.surface) },
  ].filter((c) => c.ratio < 4.5);
  if (!checks.length) return null;
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        Низкий контраст (WCAG AA ≥ 4.5): {checks.map((c) => `${c.label.toLowerCase()} — ${c.ratio.toFixed(1)}`).join('; ')}
      </div>
    </div>
  );
}

/** Упрощённая панель стиля для Easy Mode. */
export function QuickStyle() {
  const theme = useClubStore((s) => s.schema.theme);
  const setThemeToken = useClubStore((s) => s.setThemeToken);
  const roundness: { value: string; label: string; radius: number }[] = [
    { value: '2', label: 'Строго', radius: 2 },
    { value: '12', label: 'Мягко', radius: 12 },
    { value: '24', label: 'Округло', radius: 24 },
  ];
  const current = roundness.reduce((a, b) => (Math.abs(b.radius - theme.borderRadius) < Math.abs(a.radius - theme.borderRadius) ? b : a));
  return (
    <div className="space-y-5">
      <Section title="Палитра" icon={<Palette className="h-3.5 w-3.5" />}>
        <PaletteGrid current={theme.colors} onPick={(c) => setThemeToken('colors', { ...c })} />
      </Section>
      <Section title="Форма и ритм" icon={<Rows3 className="h-3.5 w-3.5" />}>
        <div>
          <Label>Углы</Label>
          <Segmented
            ariaLabel="Скругление"
            value={current.value}
            options={roundness}
            onChange={(v) => setThemeToken('borderRadius', Number(v))}
          />
        </div>
        <div>
          <Label>Плотность</Label>
          <Segmented ariaLabel="Плотность" value={theme.density} options={DENSITY_OPTIONS} onChange={(v) => setThemeToken('density', v)} />
        </div>
      </Section>
    </div>
  );
}

/** Полная панель токенов темы для Advanced/Pro Mode. */
export function ThemeCustomizer() {
  const theme = useClubStore((s) => s.schema.theme);
  const setThemeToken = useClubStore((s) => s.setThemeToken);
  const setThemeColor = useClubStore((s) => s.setThemeColor);

  return (
    <Accordion type="multiple" defaultValue={['shape', 'colors', 'effects']} className="px-1">
      <AccordionItem value="shape">
        <AccordionTrigger>
          <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-violet-400" />Форма</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-5">
          <Slider label="Скругление углов" value={theme.borderRadius} min={0} max={28} onChange={(v) => setThemeToken('borderRadius', v)} />
          <Slider label="Толщина рамок" value={theme.borderWidth} min={0} max={4} onChange={(v) => setThemeToken('borderWidth', v)} />
          <div>
            <Label>Плотность интерфейса</Label>
            <Segmented ariaLabel="Плотность" value={theme.density} options={DENSITY_OPTIONS} onChange={(v) => setThemeToken('density', v)} />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="colors">
        <AccordionTrigger>
          <span className="flex items-center gap-2"><Palette className="h-4 w-4 text-violet-400" />Цвета</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <PaletteGrid current={theme.colors} onPick={(c) => setThemeToken('colors', { ...c })} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            {(Object.keys(COLOR_LABELS) as (keyof ThemeColors)[]).map((key) => (
              <ColorField key={key} name={key} value={theme.colors[key]} onChange={(v) => setThemeColor(key, v)} />
            ))}
          </div>
          <ContrastWarnings colors={theme.colors} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="effects">
        <AccordionTrigger>
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-400" />Тени и разделители</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <div>
            <Label>Интенсивность теней</Label>
            <ShadowPicker theme={theme} onChange={(v) => setThemeToken('shadowIntensity', v)} />
          </div>
          <div>
            <Label>Стиль разделителей</Label>
            <DividerPicker value={theme.dividerStyle} primary={theme.colors.primary} accent={theme.colors.accent} onChange={(v) => setThemeToken('dividerStyle', v)} />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
