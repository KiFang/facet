import { Navbar } from '@/components/Navbar';
import { Sidebar } from '@/components/Sidebar';
import { LivePreview } from '@/components/LivePreview';

export default function App() {
  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <Navbar />
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="max-h-[50vh] shrink-0 overflow-y-auto border-b border-zinc-800 lg:max-h-none lg:w-[420px] lg:border-b-0 lg:border-r">
          <Sidebar />
        </aside>
        <section className="min-h-0 flex-1 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.10),transparent_60%)] pt-1">
          <LivePreview />
        </section>
      </main>
    </div>
  );
}
