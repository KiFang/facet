import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: RadixTabs.TabsListProps) {
  return <RadixTabs.List className={cn('flex gap-1 border-b border-zinc-800 px-3', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: RadixTabs.TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      className={cn(
        '-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:text-white data-[state=active]:border-violet-500 data-[state=active]:text-white',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: RadixTabs.TabsContentProps) {
  return <RadixTabs.Content className={cn('focus-visible:outline-none', className)} {...props} />;
}
