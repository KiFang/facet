import type { ClubEntity, ClubSchema, EntityField, ViewType } from '@/types/schema';
import { resolveRelations, type ResolvedRelation } from '@/utils/relations';
import type { PortalRecord } from './types';

/** Поле-заголовок записи: первое текстовое. */
export function titleFieldOf(entity: ClubEntity): EntityField | undefined {
  return entity.fields.find((f) => f.type === 'text') ?? entity.fields[0];
}

export function statusFieldOf(entity: ClubEntity): EntityField | undefined {
  return entity.fields.find((f) => f.type === 'status');
}

export function groupFieldOf(entity: ClubEntity): EntityField | undefined {
  const groupable = entity.fields.filter((f) => f.type === 'status' || f.type === 'select');
  return groupable.find((f) => f.id === entity.view?.groupBy) ?? groupable.find((f) => f.type === 'status') ?? groupable[0];
}

export function dateFieldOf(entity: ClubEntity): EntityField | undefined {
  const dated = entity.fields.filter((f) => f.type === 'date');
  return dated.find((f) => f.id === entity.view?.dateField) ?? dated[0];
}

export function availableViews(entity: ClubEntity): ViewType[] {
  const views: ViewType[] = ['cards', 'table'];
  if (groupFieldOf(entity)) views.push('kanban');
  if (dateFieldOf(entity)) views.push('calendar');
  return views;
}

export function relationsOf(schema: ClubSchema, entity: ClubEntity): ResolvedRelation[] {
  return resolveRelations(entity, schema);
}

export function recordTitle(entity: ClubEntity | undefined, record: PortalRecord, fallback: string): string {
  const tf = entity && titleFieldOf(entity);
  const v = tf ? record[tf.id] : undefined;
  return v === undefined || v === null || v === '' ? fallback : String(v);
}

/** PocketBase хранит даты как «2026-10-20 18:00:00.000Z». */
export function parsePbDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function expandedList(record: PortalRecord, name: string): PortalRecord[] {
  const v = record.expand?.[name];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export function isImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name);
}

export function fileNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return typeof value === 'string' && value ? [value] : [];
}
