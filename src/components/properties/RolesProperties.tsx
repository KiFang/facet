import { Eye, Globe, Minus, Pencil, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useSettings } from '@/store/useSettings';
import { useT, type TKey } from '@/i18n';
import { getEntityIcon } from '@/lib/icons';
import { uniqueId } from '@/lib/id';
import { cn } from '@/lib/cn';
import { accessOf, CHAIR_ROLE } from '@/utils/access';
import type { AccessLevel, ClubEntity, ClubRole } from '@/types/schema';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Section } from '../ui/Section';
import { Switch } from '../ui/Switch';
import { Tip } from '../ui/Tooltip';
import { PropertyPage } from './PropertyPage';

const NEXT: Record<AccessLevel, AccessLevel> = { none: 'read', read: 'write', write: 'none' };
const ICON: Record<AccessLevel, typeof Eye> = { none: Minus, read: Eye, write: Pencil };
const STYLE: Record<AccessLevel, string> = {
  none: 'text-fg-subtle hover:bg-hover',
  read: 'bg-accent-soft text-accent-text hover:bg-accent-soft/70',
  write: 'bg-success-soft text-success hover:bg-success-soft/70',
};
export const LEVEL_LABEL: Record<AccessLevel, TKey> = { none: 'access.none', read: 'access.read', write: 'access.write' };

/** Ячейка прав: щелчок по кругу «нет → просмотр → изменение». */
export function AccessCell({ level, onChange, disabled, label }: { level: AccessLevel; onChange?: (l: AccessLevel) => void; disabled?: boolean; label: string }) {
  const t = useT();
  const Icon = ICON[level];
  return (
    <Tip content={`${label}: ${t(LEVEL_LABEL[level])}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${t(LEVEL_LABEL[level])}`}
        data-level={level}
        onClick={() => onChange?.(NEXT[level])}
        className={cn('flex h-7 w-full items-center justify-center rounded transition-colors disabled:cursor-default', STYLE[level], disabled && 'opacity-70 hover:bg-transparent')}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    </Tip>
  );
}

function RoleRow({ role, onRemove }: { role: ClubRole; onRemove: () => void }) {
  const t = useT();
  const updateRole = useClubStore((s) => s.updateRole);
  const chair = role.id === CHAIR_ROLE;
  return (
    <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0" data-testid={`role-${role.id}`}>
      <UserCog className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
      <Input value={role.name} aria-label={t('roles.name')} className="h-7 min-w-0 flex-1 text-xs" onChange={(e) => updateRole(role.id, { name: e.target.value })} />
      <Tip content={t('roles.manageStaffHint')}>
        <span className="flex items-center gap-1.5 text-2xs text-fg-muted">
          <Switch checked={chair || !!role.manageStaff} disabled={chair} label={t('roles.manageStaff')} onChange={(v) => updateRole(role.id, { manageStaff: v || undefined })} />
        </span>
      </Tip>
      <Button size="icon-sm" variant="danger" disabled={chair} aria-label={t('roles.remove', { name: role.name })} onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function RolesProperties() {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const addRole = useClubStore((s) => s.addRole);
  const removeRole = useClubStore((s) => s.removeRole);
  const updateRole = useClubStore((s) => s.updateRole);
  const setRoleAccess = useClubStore((s) => s.setRoleAccess);
  const setEntityPublic = useClubStore((s) => s.setEntityPublic);
  const roles = schema.roles ?? [];

  const add = () => {
    const name = t('roles.newName');
    addRole({ id: uniqueId('role', roles.map((r) => r.id)), name, default: 'read' });
  };
  const remove = (role: ClubRole) => {
    if (useSettings.getState().confirmDeletes && !window.confirm(t('roles.confirmRemove', { name: role.name }))) return;
    removeRole(role.id);
  };

  return (
    <PropertyPage icon={<ShieldCheck className="h-4 w-4" />} title={t('nav.roles')} subtitle={t('roles.subtitle')} help="roles">
      <Section title={t('roles.list')} action={<Button size="xs" variant="ghost" onClick={add} data-testid="role-add"><Plus className="h-3.5 w-3.5" /> {t('roles.add')}</Button>}>
        <div className="rounded-md border border-line bg-panel">
          <div className="flex items-center gap-2 border-b border-line bg-sunken px-2.5 py-1 text-2xs font-medium text-fg-muted">
            <span className="w-3.5" />
            <span className="flex-1">{t('roles.name')}</span>
            <span>{t('roles.manageStaff')}</span>
            <span className="w-7" />
          </div>
          {roles.map((r) => <RoleRow key={r.id} role={r} onRemove={() => remove(r)} />)}
        </div>
        <p className="text-2xs text-fg-subtle">{t('roles.hint')}</p>
      </Section>

      <Section title={t('roles.matrix')}>
        <div className="overflow-x-auto rounded-md border border-line bg-panel">
          <table className="w-full table-fixed border-collapse text-xs" data-testid="access-matrix">
            <thead>
              <tr className="border-b border-line bg-sunken">
                <th className="w-[30%] px-2 py-1.5 text-left font-medium text-fg-muted">{t('roles.section')}</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-0.5 py-1.5 text-center text-2xs font-medium text-fg-muted" title={r.name}>
                    <span className="block truncate">{r.name}</span>
                  </th>
                ))}
                <th className="w-11 px-0.5 py-1.5 text-center font-medium text-fg-muted" title={t('access.public')}>
                  <Globe className="mx-auto h-3.5 w-3.5" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line bg-sunken/50">
                <td className="px-2 py-1 text-2xs italic text-fg-subtle">{t('roles.default')}</td>
                {roles.map((r) => (
                  <td key={r.id} className="px-0.5 py-1">
                    <AccessCell level={r.default} disabled={r.id === CHAIR_ROLE} label={`${r.name} · ${t('roles.default')}`} onChange={(l) => updateRole(r.id, { default: l })} />
                  </td>
                ))}
                <td />
              </tr>
              {schema.entities.map((e: ClubEntity) => {
                const Icon = getEntityIcon(e.icon);
                return (
                  <tr key={e.id} className="border-b border-line last:border-b-0" data-testid={`access-${e.id}`}>
                    <td className="px-2 py-1">
                      <span className="flex min-w-0 items-center gap-1.5 text-fg"><Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" /><span className="truncate">{e.pluralName}</span></span>
                    </td>
                    {roles.map((r) => (
                      <td key={r.id} className="px-0.5 py-1">
                        <AccessCell
                          level={r.id === CHAIR_ROLE ? 'write' : accessOf(r, e.id)}
                          disabled={r.id === CHAIR_ROLE}
                          label={`${r.name} · ${e.pluralName}`}
                          onChange={(l) => setRoleAccess(r.id, e.id, l)}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <Switch checked={!!e.public} label={`${t('access.public')} · ${e.pluralName}`} onChange={(v) => setEntityPublic(e.id, v)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3 text-2xs text-fg-muted">
          {(['none', 'read', 'write'] as AccessLevel[]).map((l) => {
            const Icon = ICON[l];
            return <span key={l} className="flex items-center gap-1"><span className={cn('flex h-4 w-4 items-center justify-center rounded', STYLE[l])}><Icon className="h-3 w-3" /></span>{t(LEVEL_LABEL[l])}</span>;
          })}
          <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{t('access.public')}</span>
        </div>
        <p className="text-2xs text-fg-subtle">{t('roles.matrixHint')}</p>
      </Section>
    </PropertyPage>
  );
}
