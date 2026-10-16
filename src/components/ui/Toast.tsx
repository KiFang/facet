import { create } from 'zustand';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
  action?: { label: string; run: () => void };
}

interface ToastState {
  items: ToastItem[];
  push: (item: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (item) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items.slice(-3), { ...item, id }] }));
    setTimeout(() => get().dismiss(id), item.action ? 7000 : 3500);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = (tone: Tone, text: string, action?: ToastItem['action']) => useToasts.getState().push({ tone, text, action });

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };

export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-60 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div key={t.id} className="pointer-events-auto flex animate-fade-in items-start gap-2.5 rounded-lg border border-line-strong bg-raised p-3 text-sm text-fg shadow-pop">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.tone === 'success' ? 'text-success' : t.tone === 'error' ? 'text-danger' : 'text-accent')} />
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button type="button" className="shrink-0 font-semibold text-accent-text hover:underline" onClick={() => { t.action!.run(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button type="button" className="shrink-0 text-fg-subtle hover:text-fg" onClick={() => dismiss(t.id)} aria-label="×">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
