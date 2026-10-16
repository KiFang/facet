import * as RadixAccordion from '@radix-ui/react-accordion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Accordion = RadixAccordion.Root;

export function AccordionItem({ className, ...props }: RadixAccordion.AccordionItemProps) {
  return <RadixAccordion.Item className={cn('border-b border-line last:border-b-0', className)} {...props} />;
}

export function AccordionTrigger({ children, className, ...props }: RadixAccordion.AccordionTriggerProps) {
  return (
    <RadixAccordion.Header className="flex min-w-0 flex-1">
      <RadixAccordion.Trigger
        className={cn(
          'group flex flex-1 items-center gap-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted transition-colors hover:text-fg focus-visible:outline-hidden',
          className,
        )}
        {...props}
      >
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform duration-150 group-data-[state=open]:rotate-90" />
        {children}
      </RadixAccordion.Trigger>
    </RadixAccordion.Header>
  );
}

export function AccordionContent({ children, className, ...props }: RadixAccordion.AccordionContentProps) {
  return (
    <RadixAccordion.Content className="overflow-hidden" {...props}>
      <div className={cn('pb-4 pt-1', className)}>{children}</div>
    </RadixAccordion.Content>
  );
}
