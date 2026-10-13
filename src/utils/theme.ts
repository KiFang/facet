import type { Density, ThemeTokens } from '@/types/schema';

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Относительная яркость по WCAG. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Цвет текста поверх заданного фона — чёрный или белый, что контрастнее. */
export function readableOn(hex: string): string {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#111111') ? '#ffffff' : '#111111';
}

export const DENSITY_SCALE: Record<Density, { pad: number; gap: number; font: number }> = {
  compact: { pad: 12, gap: 10, font: 13 },
  comfortable: { pad: 18, gap: 16, font: 14 },
  spacious: { pad: 26, gap: 24, font: 15 },
};

export function shadowValue(theme: ThemeTokens): string {
  switch (theme.shadowIntensity) {
    case 'none':
      return 'none';
    case 'soft':
      return '0 1px 2px rgba(15, 23, 42, 0.05), 0 2px 10px rgba(15, 23, 42, 0.06)';
    case 'medium':
      return '0 4px 12px rgba(15, 23, 42, 0.10), 0 14px 36px rgba(15, 23, 42, 0.10)';
    case 'colored':
      return `0 6px 18px ${rgba(theme.colors.primary, 0.28)}, 0 2px 4px ${rgba(theme.colors.accent, 0.18)}`;
  }
}

/** Все токены темы в виде CSS custom properties — общие для превью и экспортированного портала. */
export function themeToCssVars(theme: ThemeTokens): Record<string, string> {
  const d = DENSITY_SCALE[theme.density];
  const { colors } = theme;
  const isDark = luminance(colors.background) < 0.2;
  return {
    '--fx-radius': `${theme.borderRadius}px`,
    '--fx-radius-sm': `${Math.max(0, Math.round(theme.borderRadius * 0.6))}px`,
    '--fx-border-width': `${theme.borderWidth}px`,
    '--fx-border-color': rgba(colors.text, isDark ? 0.16 : 0.12),
    '--fx-shadow': shadowValue(theme),
    '--fx-pad': `${d.pad}px`,
    '--fx-gap': `${d.gap}px`,
    '--fx-font-size': `${d.font}px`,
    '--fx-primary': colors.primary,
    '--fx-on-primary': readableOn(colors.primary),
    '--fx-primary-soft': rgba(colors.primary, isDark ? 0.22 : 0.1),
    '--fx-accent': colors.accent,
    '--fx-on-accent': readableOn(colors.accent),
    '--fx-accent-soft': rgba(colors.accent, isDark ? 0.22 : 0.14),
    '--fx-bg': colors.background,
    '--fx-surface': colors.surface,
    '--fx-text': colors.text,
    '--fx-muted': rgba(colors.text, 0.62),
  };
}

export function cssVarsToText(vars: Record<string, string>, selector = ':root'): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `${selector} {\n${body}\n}`;
}

/** CSS-правила разделителя для выбранного стиля (класс `.fx-divider`). */
export function dividerCss(theme: ThemeTokens): string {
  switch (theme.dividerStyle) {
    case 'solid':
      return '.fx-divider { height: 0; border: 0; border-top: max(1px, var(--fx-border-width)) solid var(--fx-border-color); margin: 0; }';
    case 'dashed':
      return '.fx-divider { height: 0; border: 0; border-top: max(1px, var(--fx-border-width)) dashed var(--fx-border-color); margin: 0; }';
    case 'gradient':
      return '.fx-divider { height: 2px; border: 0; margin: 0; background: linear-gradient(90deg, transparent, var(--fx-primary), var(--fx-accent), transparent); opacity: .7; }';
    case 'minimal':
      return '.fx-divider { height: 3px; width: 40px; border: 0; margin: 0; border-radius: 3px; background: var(--fx-primary); }';
  }
}
