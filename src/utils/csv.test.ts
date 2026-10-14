import { describe, expect, it } from 'vitest';
import { autoMap, detectDelimiter, googleSheetCsvUrl, importTargets, inferFieldType, parseCsv, toTable } from './csv';
import { buildPresetSchema } from '@/data/presets';
import { normalizeSchema } from './normalize';

describe('parseCsv', () => {
  it('разбирает кавычки, экранирование, переводы строк и BOM', () => {
    const text = '﻿Имя,Заметка\n"Маша ""Ли""","строка 1\nстрока 2"\r\nПётр,"a, b"\n';
    expect(parseCsv(text)).toEqual([
      ['Имя', 'Заметка'],
      ['Маша "Ли"', 'строка 1\nстрока 2'],
      ['Пётр', 'a, b'],
    ]);
  });

  it('определяет разделитель Excel в русской локали и табуляцию', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('"x;y",b\n')).toBe(',');
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('выравнивает строки разной длины и придумывает пустые заголовки', () => {
    const table = toTable([['A', ''], ['1', '2', '3'], ['4']]);
    expect(table.headers).toEqual(['A', 'Колонка 2', 'Колонка 3']);
    expect(table.rows).toEqual([['1', '2', '3'], ['4', '', '']]);
  });
});

describe('inferFieldType', () => {
  it('числа, даты, варианты, текст', () => {
    expect(inferFieldType('Кол-во', ['1', '2 500', '3,5', ''])).toEqual({ type: 'number' });
    expect(inferFieldType('Дата', ['14.10.2026', '2026-10-15', '01.01.2025 18:30'])).toEqual({ type: 'date' });
    expect(inferFieldType('Статус', ['Новое', 'Готово', 'Новое', 'Готово'])).toEqual({ type: 'status', options: ['Новое', 'Готово'] });
    expect(inferFieldType('Роль', ['A', 'B', 'A', 'B'])).toEqual({ type: 'select', options: ['A', 'B'] });
    expect(inferFieldType('Имя', ['Аня', 'Тимур', 'Лиза'])).toEqual({ type: 'text' });
  });
});

describe('autoMap', () => {
  const schema = normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'easy' });
  const members = schema.entities.find((e) => e.id === 'members')!;
  const targets = importTargets(schema, members);

  it('сопоставляет точные названия, синонимы и вхождения', () => {
    expect(autoMap(['ФИО', 'Роль', 'Факультет', 'В клубе с', 'Telegram', 'Лишнее'], targets)).toEqual([
      'full_name', 'role', 'faculty', 'joined_at', 'telegram', null,
    ]);
  });

  it('не назначает одно поле двум колонкам', () => {
    expect(autoMap(['Роль', 'роль'], targets)).toEqual(['role', null]);
  });

  it('предлагает связи уровня сущности как цели', () => {
    const events = schema.entities.find((e) => e.id === 'events')!;
    expect(importTargets(schema, events).some((t) => t.key === 'members' && t.kind === 'link')).toBe(true);
  });
});

describe('googleSheetCsvUrl', () => {
  it('обычная ссылка и опубликованная таблица', () => {
    expect(googleSheetCsvUrl('https://docs.google.com/spreadsheets/d/abc123/edit#gid=42')).toBe(
      'https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=42',
    );
    expect(googleSheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pubhtml')).toBe(
      'https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv',
    );
    expect(googleSheetCsvUrl('https://example.com/sheet')).toBeNull();
    expect(googleSheetCsvUrl('не ссылка')).toBeNull();
  });
});
