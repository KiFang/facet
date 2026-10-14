import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const base =
  'w-full rounded-md border border-line-strong bg-panel px-2.5 text-sm text-fg placeholder:text-fg-subtle transition-colors hover:border-fg-subtle/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, 'h-8', className)} {...props} />,
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <span className={cn('relative block', className?.includes('w-') ? '' : 'w-full')}>
      <select ref={ref} className={cn(base, 'h-8 cursor-pointer appearance-none pr-7', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
    </span>
  ),
);
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(base, 'py-1.5', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export function Label({ children, hint, htmlFor }: { children: React.ReactNode; hint?: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-fg-muted">
      <span>{children}</span>
      {hint && <span className="text-2xs font-normal text-fg-subtle">{hint}</span>}
    </label>
  );
}

/** Строка формы «подпись — значение» как в окнах свойств. */
export function Field({ label, hint, children, htmlFor, description }: { label: React.ReactNode; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} hint={hint}>{label}</Label>
      {children}
      {description && <p className="mt-1 text-2xs leading-4 text-fg-subtle">{description}</p>}
    </div>
  );
}
