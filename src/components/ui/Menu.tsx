import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Общие классы пунктов меню (меню-бар, выпадающие и контекстные меню). */
export const menuContentClass =
  'z-[60] min-w-[220px] rounded-md border border-line-strong bg-raised p-1 text-sm text-fg shadow-pop animate-slide-down';
export const menuItemClass =
  'relative flex h-7 cursor-default select-none items-center gap-2 rounded px-2 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[disabled]:opacity-40';
export const menuSeparatorClass = 'my-1 h-px bg-line';
export const menuLabelClass = 'px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle';

export function MenuShortcut({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto pl-6 text-xs text-fg-subtle group-data-[highlighted]:text-accent-fg/80">{children}</span>;
}

export function MenuItemBody({ icon, label, shortcut, checked }: { icon?: React.ReactNode; label: React.ReactNode; shortcut?: string; checked?: boolean }) {
  return (
    <>
      <span className="flex w-4 justify-center">{checked ? <Check className="h-3.5 w-3.5" /> : icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {shortcut && <MenuShortcut>{shortcut}</MenuShortcut>}
    </>
  );
}

export const DropdownMenu = Dropdown.Root;
export const DropdownTrigger = Dropdown.Trigger;

export function DropdownContent({ children, className, align = 'start' }: { children: React.ReactNode; className?: string; align?: 'start' | 'end' | 'center' }) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content align={align} sideOffset={4} className={cn(menuContentClass, className)}>
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

export function DropdownItem({ icon, label, shortcut, onSelect, disabled, danger }: { icon?: React.ReactNode; label: React.ReactNode; shortcut?: string; onSelect: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Dropdown.Item className={cn('group', menuItemClass, danger && 'text-danger data-[highlighted]:bg-danger')} onSelect={onSelect} disabled={disabled}>
      <MenuItemBody icon={icon} label={label} shortcut={shortcut} />
    </Dropdown.Item>
  );
}

export const DropdownSeparator = () => <Dropdown.Separator className={menuSeparatorClass} />;
