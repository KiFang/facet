import { cn } from '@/lib/cn';

/** Группа свойств: заголовок-«шапка» как в окнах свойств, затем содержимое. */
export function Section({ title, icon, children, action, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line pb-1.5">
        <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
