import * as RadixSlider from '@radix-ui/react-slider';
import { Label } from './Input';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step = 1, unit = 'px', onChange }: SliderProps) {
  return (
    <div>
      <Label hint={<span className="font-mono">{value}{unit}</span>}>{label}</Label>
      <RadixSlider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      >
        <RadixSlider.Track className="relative h-1 grow overflow-hidden rounded-full bg-line">
          <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="block h-4 w-4 rounded-full border-2 border-accent bg-panel shadow-panel transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25" />
      </RadixSlider.Root>
    </div>
  );
}
