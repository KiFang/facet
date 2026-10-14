import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, Palette, Rows3, SlidersHorizontal, Sparkles, Trash2, Type } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import type { Density, DividerStyle, FontFamily, ShadowIntensity, ThemeColors, ThemeTokens } from '@/types/schema';
import { useT, type TFunction, type TKey } from '@/i18n';
import { contrastRatio, FONTS, shadowValue } from '@/utils/theme';
import { cn } from '@/lib/cn';
import { Slider } from './ui/Slider';
import { Segmented } from './ui/Segmented';
import { Label } from './ui/Input';
import { Section } from './ui/Section';
import { Button } from './ui/Button';
import { toast } from './ui/Toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/Accordion';

export const PALETTES: { id: string; colors: ThemeColors }[] = [
  { id: 'amethyst', colors: { primary: '#6d28d9', background: '#f6f5fb', surface: '#ffffff', accent: '#f59e0b', text: '#1e1b2e' } },
  { id: 'neon', colors: { primary: '#22d3ee', background: '#0b0f1a', surface: '#131a2b', accent: '#f43f5e', text: '#e6edf7' } },
  { id: 'tavern', colors: { primary: '#b45309', background: '#fbf6ee', surface: '#fffdf8', accent: '#15803d', text: '#3b2a1a' } },
  { id: 'newspaper', colors: { primary: '#111827', background: '#fafafa', surface: '#ffffff', accent: '#ef4444', text: '#111827' } },
  { id: 'forest', colors: { primary: '#047857', background: '#f1f7f4', surface: '#ffffff', accent: '#eab308', text: '#0f2a1f' } },
  { id: 'ocean', colors: { primary: '#2563eb', background: '#eff4ff', surface: '#ffffff', accent: '#06b6d4', text: '#0f1b3d' } },
  { id: 'sunset', colors: { primary: '#e11d48', background: '#fff5f5', surface: '#ffffff', accent: '#fb923c', text: '#3a1220' } },
  { id: 'midnight', colors: { primary: '#a78bfa', background: '#0f0d1a', surface: '#1a1730', accent: '#34d399', text: '#ece9fb' } },
];

const COLOR_KEYS: (keyof ThemeColors)[] = ['primary', 'accent', 'background', 'surface', 'text'];
const SHADOWS: ShadowIntensity[] = ['none', 'soft', 'medium', 'colored'];
const DIVIDERS: DividerStyle[] = ['solid', 'dashed', 'gradient', 'minimal'];
const DENSITIES: Density[] = ['compact', 'comfortable', 'spacious'];
const densityOptions = (t: TFunction) => DENSITIES.map((value) => ({ value, label: t(`density.${value}` as TKey) }));

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const MAX_LOGO_PX = 256;

/* ----------------------------------- logo ------------------------------------ */

/** Картинка → не больше 256 px по большей стороне, WebP (SVG сохраняется как есть). */
async function prepareLogo(file: File): Promise<string> {
  const asDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  if (file.type === 'image/svg+xml') {
    if (file.size > 100_000) throw new Error('SVG > 100 KB');
    return asDataUrl(file);
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_LOGO_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/webp', 0.9),
  );
  return asDataUrl(blob);
}

export function LogoPicker() {
  const t = useT();
  const logo = useClubStore((s) => s.schema.theme.logo);
  const setThemeToken = useClubStore((s) => s.setThemeToken);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-sunken">
        {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1" /> : <ImagePlus className="h-5 w-5 text-fg-subtle" />}
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          aria-label={t('logo.upload')}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setThemeToken('logo', await prepareLogo(file));
            } catch (err) {
              toast('error', `${t('logo.failed')}: ${(err as Error).message}`);
            }
          }}
        />
        <div className="flex gap-1">
          <Button size="sm" onClick={() => ref.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5" /> {logo ? t('logo.replace') : t('logo.upload')}
          </Button>
          {logo && (
            <Button size="sm" variant="danger" onClick={() => setThemeToken('logo', undefined)} aria-label={t('logo.remove')} title={t('logo.remove')}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <span className="text-[11px] text-fg-subtle">{t('logo.hint')}</span>
      </div>
    </div>
  );
}

/* ----------------------------------- font ------------------------------------ */

export function FontPicker() {
  const t = useT();
  const font = useClubStore((s) => s.schema.theme.font ?? 'inter');
  const setThemeToken = useClubStore((s) => s.setThemeToken);
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('style.font')}>
      {(Object.keys(FONTS) as FontFamily[]).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={font === id}
          onClick={() => setThemeToken('font', id)}
          className={cn(
            'rounded-lg border px-2 py-2 text-left transition-colors',
            font === id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg hover:border-fg-subtle',
          )}
        >
          <span className="block text-lg leading-none" style={{ fontFamily: FONTS[id].stack }}>Аа Bb</span>
          <span className="mt-1 block truncate text-[11px] text-fg-muted">{id === 'system' ? t('font.system') : FONTS[id].label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- colors ----------------------------------- */

function ColorField({ name, value, onChange }: { name: keyof ThemeColors; value: string; onChange: (v: string) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const id = `color-${name}`;
  const label = t(`color.${name}` as TKey);
  return (
    <div className="flex items-center gap-2.5">
      <label
        className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line-strong shadow-inner"
        style={{ background: value }}
        title={label}
      >
        <input
          type="color"
          value={value.length === 4 ? `#${value.slice(1).split('').map((c) => c + c).join('')}` : value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
      </label>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-xs font-medium text-fg-muted">{label}</label>
        <input
          id={id}
          value={draft}
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          onBlur={() => setDraft(value)}
          className={cn('w-full bg-transparent font-mono text-sm uppercase text-fg focus:outline-none', !HEX.test(draft) && 'text-danger')}
        />
      </div>
    </div>
  );
}

function PaletteGrid({ current, onPick }: { current: ThemeColors; onPick: (c: ThemeColors) => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-4 gap-2">
      {PALETTES.map((p) => {
        const active = p.colors.primary === current.primary && p.colors.background === current.background;
        const name = t(`palette.${p.id}` as TKey);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.colors)}
            className={cn('group rounded-lg border p-1.5 text-left transition-colors', active ? 'border-accent bg-accent-soft' : 'border-line hover:border-fg-subtle')}
            title={name}
          >
            <div className="flex h-9 overflow-hidden rounded-lg" style={{ background: p.colors.background }}>
              <div className="m-1.5 flex-1 rounded" style={{ background: p.colors.primary }} />
              <div className="my-1.5 mr-1.5 w-2.5 rounded" style={{ background: p.colors.accent }} />
            </div>
            <div className="mt-1 truncate px-0.5 text-[11px] text-fg-muted group-hover:text-fg">{name}</div>
          </button>
        );
      })}
    </div>
  );
}

function ContrastWarnings({ colors }: { colors: ThemeColors }) {
  const t = useT();
  const checks = [
    { label: t('contrast.onBackground'), ratio: contrastRatio(colors.text, colors.background) },
    { label: t('contrast.onSurface'), ratio: contrastRatio(colors.text, colors.surface) },
  ].filter((c) => c.ratio < 4.5);
  if (!checks.length) return null;
  return (
    <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning-soft p-2.5 text-xs text-warning">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{t('contrast.low')}: {checks.map((c) => `${c.label} — ${c.ratio.toFixed(1)}`).join('; ')}</div>
    </div>
  );
}

/* --------------------------------- effects ----------------------------------- */

function ShadowPicker({ theme, onChange }: { theme: ThemeTokens; onChange: (v: ShadowIntensity) => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-4 gap-2">
      {SHADOWS.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            'flex flex-col items-center gap-2 rounded-lg border px-1 pb-2 pt-3 text-[11px] transition-colors',
            theme.shadowIntensity === value ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-muted hover:border-fg-subtle',
          )}
        >
          <span className="h-7 w-10 rounded-md bg-white" style={{ boxShadow: shadowValue({ ...theme, shadowIntensity: value }) }} />
          {t(`shadow.${value}` as TKey)}
        </button>
      ))}
    </div>
  );
}

function DividerPicker({ value, primary, accent, onChange }: { value: DividerStyle; primary: string; accent: string; onChange: (v: DividerStyle) => void }) {
  const t = useT();
  const sample = (style: DividerStyle) => {
    switch (style) {
      case 'solid':
        return <span className="block h-0 w-full border-t border-fg-subtle" />;
      case 'dashed':
        return <span className="block h-0 w-full border-t border-dashed border-fg-subtle" />;
      case 'gradient':
        return <span className="block h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${primary}, ${accent}, transparent)` }} />;
      case 'minimal':
        return <span className="block h-[3px] w-4 rounded" style={{ background: primary }} />;
    }
  };
  return (
    <div className="grid grid-cols-4 gap-2">
      {DIVIDERS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={cn(
            'flex flex-col items-center gap-2.5 rounded-lg border px-2 pb-2 pt-4 text-[11px] transition-colors',
            value === d ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-muted hover:border-fg-subtle',
          )}
        >
          <span className="flex h-2 w-full items-center justify-start">{sample(d)}</span>
          {t(`divider.${d}` as TKey)}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- panels ------------------------------------ */

/** Упрощённая панель стиля для Easy Mode. */
export function QuickStyle() {
  const t = useT();
  const theme = useClubStore((s) => s.schema.theme);
  const setThemeToken = useClubStore((s) => s.setThemeToken);
  const roundness = [
    { value: '2', label: t('radius.sharp'), radius: 2 },
    { value: '12', label: t('radius.soft'), radius: 12 },
    { value: '24', label: t('radius.round'), radius: 24 },
  ];
  const current = roundness.reduce((a, b) => (Math.abs(b.radius - theme.borderRadius) < Math.abs(a.radius - theme.borderRadius) ? b : a));
  return (
    <div className="space-y-6">
      <Section title={t('style.brand')} icon={<ImagePlus className="h-3.5 w-3.5" />}>
        <LogoPicker />
        <FontPicker />
      </Section>
      <Section title={t('style.palette')} icon={<Palette className="h-3.5 w-3.5" />}>
        <PaletteGrid current={theme.colors} onPick={(c) => setThemeToken('colors', { ...c })} />
      </Section>
      <Section title={t('style.shapeRhythm')} icon={<Rows3 className="h-3.5 w-3.5" />}>
        <div>
          <Label>{t('style.corners')}</Label>
          <Segmented ariaLabel={t('style.corners')} value={current.value} options={roundness} onChange={(v) => setThemeToken('borderRadius', Number(v))} />
        </div>
        <div>
          <Label>{t('style.density')}</Label>
          <Segmented ariaLabel={t('style.density')} value={theme.density} options={densityOptions(t)} onChange={(v) => setThemeToken('density', v)} />
        </div>
      </Section>
    </div>
  );
}

/** Полная панель токенов темы для Advanced/Pro Mode. */
export function ThemeCustomizer() {
  const t = useT();
  const theme = useClubStore((s) => s.schema.theme);
  const setThemeToken = useClubStore((s) => s.setThemeToken);
  const setThemeColor = useClubStore((s) => s.setThemeColor);

  return (
    <Accordion type="multiple" defaultValue={['brand', 'shape', 'colors', 'effects']} className="px-1">
      <AccordionItem value="brand">
        <AccordionTrigger>
          <span className="flex items-center gap-2"><Type className="h-4 w-4 text-accent" />{t('style.brand')}</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <LogoPicker />
          <div>
            <Label>{t('style.font')}</Label>
            <FontPicker />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="shape">
        <AccordionTrigger>
          <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-accent" />{t('style.shape')}</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-5">
          <Slider label={t('style.radius')} value={theme.borderRadius} min={0} max={28} onChange={(v) => setThemeToken('borderRadius', v)} />
          <Slider label={t('style.borderWidth')} value={theme.borderWidth} min={0} max={4} onChange={(v) => setThemeToken('borderWidth', v)} />
          <div>
            <Label>{t('style.density')}</Label>
            <Segmented ariaLabel={t('style.density')} value={theme.density} options={densityOptions(t)} onChange={(v) => setThemeToken('density', v)} />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="colors">
        <AccordionTrigger>
          <span className="flex items-center gap-2"><Palette className="h-4 w-4 text-accent" />{t('style.colors')}</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <PaletteGrid current={theme.colors} onPick={(c) => setThemeToken('colors', { ...c })} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border border-line bg-sunken p-3">
            {COLOR_KEYS.map((key) => (
              <ColorField key={key} name={key} value={theme.colors[key]} onChange={(v) => setThemeColor(key, v)} />
            ))}
          </div>
          <ContrastWarnings colors={theme.colors} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="effects">
        <AccordionTrigger>
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" />{t('style.effects')}</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <div>
            <Label>{t('style.shadow')}</Label>
            <ShadowPicker theme={theme} onChange={(v) => setThemeToken('shadowIntensity', v)} />
          </div>
          <div>
            <Label>{t('style.divider')}</Label>
            <DividerPicker value={theme.dividerStyle} primary={theme.colors.primary} accent={theme.colors.accent} onChange={(v) => setThemeToken('dividerStyle', v)} />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
