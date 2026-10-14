import { useRef } from 'react';
import { cn } from '@/lib/cn';

/** Перетаскиваемая граница панели. side — с какой стороны от границы панель (её ширина меняется). */
export function Resizer({ width, min, max, side, onChange, label }: { width: number; min: number; max: number; side: 'left' | 'right'; onChange: (w: number) => void; label: string }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        if (e.key === 'ArrowLeft') onChange(Math.max(min, Math.min(max, width + (side === 'left' ? -step : step))));
        if (e.key === 'ArrowRight') onChange(Math.max(min, Math.min(max, width + (side === 'left' ? step : -step))));
      }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        onChange(Math.max(min, Math.min(max, start.current.w + (side === 'left' ? dx : -dx))));
      }}
      onPointerUp={() => (start.current = null)}
      onDoubleClick={() => onChange(side === 'left' ? 240 : 420)}
      className={cn('group relative z-10 w-px shrink-0 cursor-col-resize bg-line focus-visible:bg-accent')}
    >
      <span className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-accent/30" />
    </div>
  );
}
