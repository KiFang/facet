import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Boxes, ChevronLeft, ChevronRight, FileSpreadsheet, Flag, Home, Keyboard, LayoutGrid, LayoutPanelLeft, LifeBuoy, Link2, Palette, Plug, Printer, Rocket, Search, Server,
  Settings, Table2, X, type LucideIcon,
} from 'lucide-react';
import { useT, useUiLocale } from '@/i18n';
import { cn } from '@/lib/cn';
import { listenWindows } from '@/lib/windows';
import { FACET_VERSION } from '@/version';
import { HELP_RU } from './content.ru';
import { HELP_EN } from './content.en';
import { Markdown, headingsOf, plain } from './markdown';
import type { HelpSection } from './types';

const ICONS: Record<string, LucideIcon> = {
  Rocket, LayoutPanelLeft, Flag, Boxes, Link2, LayoutGrid, Palette, Home, Table2, FileSpreadsheet, Plug, Server, Settings, Keyboard, LifeBuoy,
};

const fromHash = () => decodeURIComponent(location.hash.slice(1)).split('/');

function snippet(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return '';
  const start = Math.max(0, idx - 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, idx + q.length + 60).replace(/\s+/g, ' ')}…`;
}

export default function HelpApp() {
  const t = useT();
  const locale = useUiLocale();
  const sections: HelpSection[] = locale === 'en' ? HELP_EN : HELP_RU;
  const [current, setCurrent] = useState(() => fromHash()[0] || 'start');
  const [query, setQuery] = useState('');
  const articleRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const section = sections.find((s) => s.id === current) ?? sections[0];
  const index = sections.indexOf(section);
  const headings = useMemo(() => headingsOf(section.body).filter((h) => h.level === 2), [section]);

  const go = (id: string, anchor?: string) => {
    const [sec, a] = id.includes('/') ? id.split('/') : [id, anchor];
    setCurrent(sec);
    history.replaceState(null, '', `#${sec}${a ? `/${a}` : ''}`);
    requestAnimationFrame(() => {
      if (a) document.getElementById(a)?.scrollIntoView({ block: 'start' });
      else articleRef.current?.scrollTo({ top: 0 });
    });
  };

  useEffect(() => listenWindows((m) => {
    if (m.type === 'help:section') {
      go(m.section);
      window.focus();
    }
  }));

  useEffect(() => {
    const onHash = () => {
      const [sec, a] = fromHash();
      if (sec) go(sec, a);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  useEffect(() => {
    document.title = `${section.title} — ${t('cmd.help')} — Facet OS`;
  }, [section, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && query) setQuery('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return sections
      .map((s) => {
        const text = plain(s.body);
        const inTitle = s.title.toLowerCase().includes(q);
        const hit = snippet(text, q);
        return inTitle || hit ? { s, hit, score: (inTitle ? 2 : 0) + (hit ? 1 : 0) } : null;
      })
      .filter((x): x is { s: HelpSection; hit: string; score: number } => !!x)
      .sort((a, b) => b.score - a.score);
  }, [q, sections]);

  const groups = useMemo(() => {
    const out: { name: string; items: HelpSection[] }[] = [];
    for (const s of sections) {
      const g = out.find((x) => x.name === s.group);
      if (g) g.items.push(s);
      else out.push({ name: s.group, items: [s] });
    }
    return out;
  }, [sections]);

  const Icon = ICONS[section.icon] ?? BookOpen;
  const prev = sections[index - 1];
  const next = sections[index + 1];

  return (
    <div className="flex h-screen flex-col bg-app text-fg">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 print:hidden">
        <BookOpen className="h-4 w-4 text-accent" />
        <div className="text-sm font-semibold">{t('help.title')}</div>
        <span className="text-2xs text-fg-subtle">Facet OS {FACET_VERSION}</span>
        <button
          type="button"
          className="ml-auto flex h-7 items-center gap-1.5 rounded px-2 text-xs text-fg-muted hover:bg-hover hover:text-fg"
          onClick={() => window.print()}
        >
          <Printer className="h-3.5 w-3.5" /> {t('help.print')}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-64 shrink-0 flex-col border-r border-line bg-panel print:hidden" aria-label={t('help.contents')}>
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('help.search')}
                aria-label={t('help.search')}
                data-testid="help-search"
                className="h-8 w-full rounded-md border border-line bg-sunken pl-7 pr-7 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
              />
              {query && (
                <button type="button" aria-label={t('common.cancel')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg" onClick={() => setQuery('')}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {q ? (
              results.length ? (
                <ul className="space-y-1">
                  {results.map(({ s, hit }) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => go(s.id)} className={cn('w-full rounded px-2 py-1.5 text-left hover:bg-hover', s.id === section.id && 'bg-accent-soft')}>
                        <div className="text-sm font-medium text-fg">{s.title}</div>
                        {hit && <div className="mt-0.5 line-clamp-2 text-2xs text-fg-muted">{hit}</div>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-2 text-xs text-fg-subtle">{t('palette.empty')}</p>
              )
            ) : (
              groups.map((g) => (
                <div key={g.name} className="mb-3">
                  <div className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{g.name}</div>
                  {g.items.map((s) => {
                    const I = ICONS[s.icon] ?? BookOpen;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        data-testid={`help-toc-${s.id}`}
                        aria-current={s.id === section.id ? 'page' : undefined}
                        onClick={() => go(s.id)}
                        className={cn('flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm', s.id === section.id ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-hover')}
                      >
                        <I className="h-4 w-4 shrink-0 opacity-80" /> <span className="truncate">{s.title}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </nav>

        <div ref={articleRef} className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto flex max-w-5xl gap-8 px-8 py-6">
            <article className="min-w-0 max-w-3xl flex-1 text-sm text-fg-muted" data-testid="help-article">
              <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{section.group}</div>
              <h1 className="mb-4 flex items-center gap-2.5 text-xl font-semibold text-fg">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent"><Icon className="h-4 w-4" /></span>
                {section.title}
              </h1>
              <Markdown source={section.body} onLink={(id) => go(id)} />
              <div className="mt-10 grid grid-cols-2 gap-3 border-t border-line pt-4 print:hidden">
                {prev ? (
                  <button type="button" onClick={() => go(prev.id)} className="rounded-md border border-line p-3 text-left hover:border-accent">
                    <div className="flex items-center gap-1 text-2xs text-fg-subtle"><ChevronLeft className="h-3 w-3" /> {t('help.prev')}</div>
                    <div className="text-sm font-medium text-fg">{prev.title}</div>
                  </button>
                ) : <span />}
                {next && (
                  <button type="button" onClick={() => go(next.id)} className="rounded-md border border-line p-3 text-right hover:border-accent">
                    <div className="flex items-center justify-end gap-1 text-2xs text-fg-subtle">{t('help.next')} <ChevronRight className="h-3 w-3" /></div>
                    <div className="text-sm font-medium text-fg">{next.title}</div>
                  </button>
                )}
              </div>
            </article>
            {headings.length > 1 && (
              <aside className="sticky top-6 hidden w-48 shrink-0 self-start xl:block print:hidden">
                <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{t('help.onPage')}</div>
                <ul className="space-y-1 border-l border-line">
                  {headings.map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${section.id}/${h.id}`}
                        onClick={(e) => { e.preventDefault(); go(section.id, h.id); }}
                        className="-ml-px block border-l border-transparent pl-3 text-xs text-fg-muted hover:border-accent hover:text-fg"
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
