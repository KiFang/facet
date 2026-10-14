import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

interface DialogContentProps extends RadixDialog.DialogContentProps {
  title: string;
  description?: string;
}

export function DialogContent({ title, description, children, className, ...props }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(1080px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl focus:outline-none data-[state=open]:animate-pop-in',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-6 py-4">
          <div>
            <RadixDialog.Title className="text-base font-semibold text-white">{title}</RadixDialog.Title>
            {description && <RadixDialog.Description className="mt-0.5 text-sm text-zinc-400">{description}</RadixDialog.Description>}
          </div>
          <RadixDialog.Close className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
