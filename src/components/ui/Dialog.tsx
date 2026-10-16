import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

interface DialogContentProps extends RadixDialog.DialogContentProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export function DialogContent({ title, description, icon, children, className, ...props }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-fade-in" />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(1080px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-line-strong bg-panel shadow-pop focus:outline-hidden data-[state=open]:animate-pop-in',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line bg-sunken px-5 py-3">
          <div className="flex min-w-0 items-start gap-3">
            {icon && <span className="mt-0.5 text-accent">{icon}</span>}
            <div className="min-w-0">
              <RadixDialog.Title className="text-sm font-semibold text-fg">{title.replace(/(…|\.\.\.)$/, "")}</RadixDialog.Title>
              {description && <RadixDialog.Description className="mt-0.5 text-xs text-fg-muted">{description}</RadixDialog.Description>}
            </div>
          </div>
          <RadixDialog.Close className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/** Нижняя панель диалога с кнопками. */
export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken px-5 py-3', className)}>{children}</div>;
}
