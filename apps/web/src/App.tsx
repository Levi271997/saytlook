import { useState } from 'react';
import { BackendNotice } from './components/BackendNotice.js';
import { DesignPanel } from './components/DesignPanel.js';
import { ErrorPanel } from './components/ErrorPanel.js';
import { HeadingPanel } from './components/HeadingPanel.js';
import { Stage } from './components/Stage.js';
import { Toolbar } from './components/Toolbar.js';
import { UrlBar } from './components/UrlBar.js';
import { useFindingCount, useStore } from './store.js';

type Tab = 'errors' | 'headings' | 'design';

export function App() {
  const [tab, setTab] = useState<Tab>('errors');
  const findingCount = useFindingCount();
  const headingCount = useStore((state) => state.snapshot?.headings.length ?? 0);
  const hasDesign = useStore((state) => state.overlay.imageUrl !== null);

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'errors', label: 'Errors', badge: findingCount > 0 ? String(findingCount) : undefined },
    { id: 'headings', label: 'Headings', badge: headingCount > 0 ? String(headingCount) : undefined },
    { id: 'design', label: 'Design', badge: hasDesign ? 'on' : undefined },
  ];

  return (
    <div className="flex h-full flex-col">
      <BackendNotice />
      <UrlBar />
      <Toolbar />

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          <Stage />
        </main>

        <aside className="flex w-[24rem] shrink-0 flex-col border-l border-slate-800 bg-slate-900">
          <nav className="flex border-b border-slate-800">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex-1 border-b-2 px-3 py-2 text-sm transition ${
                  tab === item.id
                    ? 'border-sky-500 text-slate-100'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {item.label}
                {item.badge && (
                  <span className="ml-1.5 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1">
            {tab === 'errors' && <ErrorPanel />}
            {tab === 'headings' && <HeadingPanel />}
            {tab === 'design' && <DesignPanel />}
          </div>
        </aside>
      </div>
    </div>
  );
}
