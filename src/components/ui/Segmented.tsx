import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel: string;
}

export function Segmented<T extends string>({ value, options, onChange, className, size = 'md', ariaLabel }: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={ariaLabel}
      className={cn('inline-flex w-full rounded-lg border border-zinc-800 bg-zinc-900 p-0.5', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          title={o.title}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 data-[state=on]:bg-zinc-700 data-[state=on]:text-white data-[state=on]:shadow',
            size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
