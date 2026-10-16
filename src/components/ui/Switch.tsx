import * as RadixSwitch from '@radix-ui/react-switch';

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="relative h-[18px] w-8 shrink-0 rounded-full border border-line-strong bg-line transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent"
    >
      <RadixSwitch.Thumb className="block h-3.5 w-3.5 translate-x-px rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[15px]" />
    </RadixSwitch.Root>
  );
}
