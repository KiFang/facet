import * as RadixTooltip from '@radix-ui/react-tooltip';

export const TooltipProvider = RadixTooltip.Provider;

/** Всплывающая подсказка с необязательным сочетанием клавиш. */
export function Tip({ content, shortcut, children, side = 'bottom' }: { content: React.ReactNode; shortcut?: string; children: React.ReactElement; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RadixTooltip.Root delayDuration={350}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[70] flex max-w-xs items-center gap-2 rounded-md border border-line-strong bg-raised px-2 py-1 text-xs text-fg shadow-pop animate-fade-in"
        >
          <span>{content}</span>
          {shortcut && <kbd>{shortcut}</kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
