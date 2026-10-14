import { beforeEach, describe, expect, it } from 'vitest';
import { useGrid } from './store';
import { validateCell, fromPbDate } from './sources';
import { clipboardText, parseText, parseTsv, toTsv } from './values';
import type { GridColumn } from './types';

const cols: GridColumn[] = [
  { key: 'title', label: 'Название', type: 'text', required: true },
  { key: 'n', label: 'Число', type: 'number', required: false },
  { key: 'd', label: 'Дата', type: 'date', required: false },
  { key: 's', label: 'Статус', type: 'status', required: false, options: ['Да', 'Нет'] },
  { key: 'm', label: 'Люди', type: 'relation', required: false, target: 'members', multiple: true },
];
const rel = { members: [{ value: 'id1', label: 'Анна' }, { value: 'id2', label: 'Борис' }] };

describe('grid values', () => {
  it('parses typed and pasted text by column type', () => {
    expect(parseText(cols[1], '1 250,5', rel)).toBe(1250.5);
    expect(parseText(cols[2], '20.10.2026 18:30', rel)).toBe('2026-10-20 18:30');
    expect(parseText(cols[3], 'нет', rel)).toBe('Нет');
    expect(parseText(cols[4], 'Борис; Анна', rel)).toEqual(['id2', 'id1']);
    expect(clipboardText(cols[2], '2026-10-20 18:30', rel)).toBe('20.10.2026 18:30');
    expect(clipboardText(cols[4], ['id1'], rel)).toBe('Анна');
    expect(fromPbDate('2026-10-20 18:30:00.000Z')).toBe('2026-10-20 18:30');
  });

  it('validates cells', () => {
    expect(validateCell(cols[0], '')).toBe('required');
    expect(validateCell(cols[1], 'abc')).toBe('number');
    expect(validateCell(cols[2], '32.13.2026')).toBe('date');
    expect(validateCell(cols[3], 'Может')).toBe('option');
    expect(validateCell(cols[3], 'Да')).toBeNull();
  });

  it('round-trips Excel TSV with quotes and newlines', () => {
    const data = [['a', 'b "c"'], ['line\nbreak', 'x\ty']];
    expect(parseTsv(toTsv(data))).toEqual(data);
    expect(parseTsv('1\t2\r\n3\t4\r\n')).toEqual([['1', '2'], ['3', '4']]);
  });
});

describe('grid store', () => {
  beforeEach(() => {
    useGrid.getState().load(cols, [{ key: 'r1', values: { title: 'A', n: 1, d: '', s: 'Да', m: [] } }, { key: 'r2', values: { title: 'B', n: '', d: '', s: '', m: [] } }], rel);
  });

  it('tracks modified, new and deleted rows and builds changes', () => {
    const g = useGrid.getState();
    g.setCell('r1', 'n', 2);
    const [k] = g.addRows(1, 'r1', [{ title: 'C' }]);
    g.toggleDelete(['r2']);
    const rows = useGrid.getState().rows;
    expect(rows.map((r) => r.status)).toEqual(['modified', 'new', 'deleted']);
    const ch = useGrid.getState().changes();
    expect(ch.updated).toEqual([{ key: 'r1', patch: { n: 2 }, files: {} }]);
    expect(ch.created[0].key).toBe(k);
    expect(ch.deleted).toEqual(['r2']);
    expect(ch.order).toEqual(['r1', k]);
  });

  it('returns to clean when the value is restored', () => {
    const g = useGrid.getState();
    g.setCell('r1', 'n', 5);
    g.setCell('r1', 'n', 1);
    expect(useGrid.getState().rows[0].status).toBe('clean');
  });

  it('drops empty new rows and validates the rest', () => {
    const g = useGrid.getState();
    g.addRows(2);
    g.setCell(useGrid.getState().rows[3].key, 'n', 'x');
    g.pruneEmpty();
    expect(useGrid.getState().rows.length).toBe(3);
    expect(useGrid.getState().validate()).toBe(2); // title required + number
  });

  it('reverts everything', () => {
    const g = useGrid.getState();
    g.setCell('r2', 'title', 'BB');
    g.addRows(1);
    g.revert();
    expect(useGrid.getState().rows.map((r) => [r.key, r.status])).toEqual([['r1', 'clean'], ['r2', 'clean']]);
  });
});
