/** Мост к десктопному приложению (desktop/preload.cjs). В браузере — undefined. */

export interface LocalServerInfo {
  installed: boolean;
  running: boolean;
  url: string | null;
  lanUrls: string[];
  lan: boolean;
  schemaRaw: string | null;
  admin: { email: string; password: string } | null;
  dataDir: string;
  backups: string[];
  logs: string;
}

export interface FacetDesktop {
  platform: string;
  localServer: {
    info(): Promise<LocalServerInfo>;
    apply(bundle: { kind: 'install' | 'update'; files: { path: string; content: string; encoding?: 'base64' }[] }): Promise<LocalServerInfo>;
    start(): Promise<LocalServerInfo>;
    stop(): Promise<LocalServerInfo>;
    rollback(): Promise<LocalServerInfo>;
    setLan(lan: boolean): Promise<LocalServerInfo>;
    openUrl(url: string): Promise<void>;
    openFolder(): Promise<string>;
  };
}

declare global {
  interface Window {
    facetDesktop?: FacetDesktop;
  }
}

export const desktop = (): FacetDesktop | undefined => (typeof window === 'undefined' ? undefined : window.facetDesktop);
