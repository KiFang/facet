import { Fragment, type ReactNode } from 'react';
import { AlertTriangle, Lightbulb } from 'lucide-react';

/**
 * Небольшой рендерер разметки справки — без внешних зависимостей и без HTML из строки.
 * Поддерживает: ## / ###, абзацы, списки «- » и «1. », таблицы, > совет, >! предупреждение,
 * **жирный**, `код`, [[клавиши]], [текст](#раздел) и [текст](https://…).
 */
export function inline(text: string, onLink: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = i++;
    if (m[1]) out.push(<strong key={k} className="font-semibold text-fg">{inline(m[1], onLink)}</strong>);
    else if (m[2]) out.push(<code key={k} className="rounded bg-sunken px-1 py-px font-mono text-[0.9em] text-fg">{m[2]}</code>);
    else if (m[3]) out.push(<kbd key={k}>{m[3]}</kbd>);
    else if (m[4]) {
      const href = m[5];
      out.push(
        href.startsWith('#') ? (
          <a key={k} href={href} className="text-accent-text underline-offset-2 hover:underline" onClick={(e) => { e.preventDefault(); onLink(href.slice(1)); }}>
            {m[4]}
          </a>
        ) : (
          <a key={k} href={href} target="_blank" rel="noreferrer" className="text-accent-text underline-offset-2 hover:underline">{m[4]}</a>
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

export function headingsOf(body: string): Heading[] {
  return body
    .split('\n')
    .map((l) => /^(##|###) (.+)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ id: slug(m[2]), text: m[2], level: m[1] === '##' ? 2 : 3 }));
}

/** Текст без разметки — для поиска. */
export const plain = (body: string) => body.replace(/\*\*|`|\[\[|\]\]|^#+ |^> ?!? ?|^\|/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

export function Markdown({ source, onLink }: { source: string; onLink: (id: string) => void }) {
  const lines = source.trim().split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const isSpecial = (l: string) => /^(##|###) |^- |^\d+\. |^\||^>/.test(l.trim());
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(##|###) (.+)$/.exec(line))) {
      const Tag = m[1] === '##' ? 'h2' : 'h3';
      blocks.push(
        <Tag key={key++} id={slug(m[2])} className={Tag === 'h2' ? 'mb-2 mt-7 scroll-mt-4 border-b border-line pb-1.5 text-base font-semibold text-fg' : 'mb-1.5 mt-5 scroll-mt-4 text-sm font-semibold text-fg'}>
          {m[2]}
        </Tag>,
      );
      i++;
    } else if (/^- /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i].trim()) : /^- /.test(lines[i].trim()))) {
        items.push(lines[i].trim().replace(/^- |^\d+\. /, ''));
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={key++} className={`my-2 space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-fg-subtle`}>
          {items.map((it, j) => <li key={j} className="pl-1">{inline(it, onLink)}</li>)}
        </List>,
      );
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key++} className="my-3 overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-sunken">
              <tr>{head.map((c, j) => <th key={j} className="border-b border-line px-3 py-1.5 text-left text-xs font-semibold text-fg-muted">{inline(c, onLink)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, j) => (
                <tr key={j} className="border-b border-line last:border-b-0">
                  {r.map((c, k) => <td key={k} className="px-3 py-1.5 align-top">{inline(c, onLink)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (line.startsWith('>')) {
      const warn = line.startsWith('>!');
      const text: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        text.push(lines[i].trim().replace(/^>!? ?/, ''));
        i++;
      }
      blocks.push(
        <div key={key++} className={`my-3 flex gap-2.5 rounded-md border px-3 py-2.5 text-sm ${warn ? 'border-warning/40 bg-warning-soft' : 'border-accent/30 bg-accent-soft'}`}>
          {warn ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> : <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
          <p>{inline(text.join(' '), onLink)}</p>
        </div>,
      );
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) {
        para.push(lines[i].trim());
        i++;
      }
      blocks.push(<p key={key++} className="my-2.5 leading-relaxed">{inline(para.join(' '), onLink)}</p>);
    }
  }
  return <Fragment>{blocks}</Fragment>;
}
