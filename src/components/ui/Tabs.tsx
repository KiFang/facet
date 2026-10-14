import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: RadixTabs.TabsListProps) {
  return <RadixTabs.List className={cn('flex gap-0.5 border-b border-line px-2', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: RadixTabs.TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      className={cn(
        '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2.5 py-2 text-xs font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:text-fg data-[state=active]:border-accent data-[state=active]:text-fg',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: RadixTabs.TabsContentProps) {
  return <RadixTabs.Content className={cn('focus-visible:outline-none', className)} {...props} />;
}
