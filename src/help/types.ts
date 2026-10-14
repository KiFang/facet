export interface HelpSection {
  id: string;
  group: string;
  title: string;
  /** Имя значка lucide. */
  icon: string;
  /** Упрощённый Markdown (см. markdown.tsx). */
  body: string;
}
