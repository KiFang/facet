import * as RadixAccordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Accordion = RadixAccordion.Root;

export function AccordionItem({ className, ...props }: RadixAccordion.AccordionItemProps) {
  return <RadixAccordion.Item className={cn('border-b border-zinc-800 last:border-b-0', className)} {...props} />;
}

export function AccordionTrigger({ children, className, ...props }: RadixAccordion.AccordionTriggerProps) {
  return (
    <RadixAccordion.Header className="flex min-w-0 flex-1">
      <RadixAccordion.Trigger
        className={cn(
          'group flex flex-1 items-center justify-between gap-2 py-3 text-left text-sm font-semibold text-zinc-200 transition-colors hover:text-white focus-visible:outline-none focus-visible:text-white',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </RadixAccordion.Trigger>
    </RadixAccordion.Header>
  );
}

export function AccordionContent({ children, className, ...props }: RadixAccordion.AccordionContentProps) {
  return (
    <RadixAccordion.Content className="overflow-hidden" {...props}>
      <div className={cn('pb-4', className)}>{children}</div>
    </RadixAccordion.Content>
  );
}
