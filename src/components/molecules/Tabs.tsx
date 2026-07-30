// components/molecules/Tabs.tsx
// Compound Component Pattern — <Tabs>, <Tabs.Tab>, <Tabs.Panel>
// Usage:
//   <Tabs active={tab} onChange={setTab}>
//     <Tabs.Tab id="stats">Game Statistics</Tabs.Tab>
//     <Tabs.Tab id="analysis">Game Analysis</Tabs.Tab>
//     <Tabs.Panel id="stats">...</Tabs.Panel>
//     <Tabs.Panel id="analysis">...</Tabs.Panel>
//   </Tabs>

import { createContext, useContext, type ReactNode } from 'react';

interface TabsCtx {
  active: string;
  onChange: (id: string) => void;
}

const TabsContext = createContext<TabsCtx | null>(null);

function useTabs(): TabsCtx {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('<Tabs.Tab> and <Tabs.Panel> must be used inside <Tabs>');
  return ctx;
}

interface TabsProps {
  active: string;
  onChange: (id: string) => void;
  children: ReactNode;
  className?: string;
}

function TabsRoot({ active, onChange, children, className = '' }: TabsProps) {
  return (
    <TabsContext.Provider value={{ active, onChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabProps {
  id: string;
  children: ReactNode;
  badge?: string;
}

function Tab({ id, children, badge }: TabProps) {
  const { active, onChange } = useTabs();
  const isActive = active === id;
  return (
    <button
      type="button"
      onClick={() => onChange(id)}
      className={`
        px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200
        border border-transparent relative
        ${isActive
          ? 'bg-gradient-to-br from-[rgba(0,173,181,0.22)] to-[rgba(0,173,181,0.08)] text-white border-[rgba(0,173,181,0.35)]'
          : 'text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-white/5'
        }
      `}
    >
      {children}
      {badge && (
        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-[#00adb5]/20 text-[#00adb5]">
          {badge}
        </span>
      )}
    </button>
  );
}

interface PanelProps {
  id: string;
  children: ReactNode;
}

function Panel({ id, children }: PanelProps) {
  const { active } = useTabs();
  if (active !== id) return null;
  return <div>{children}</div>;
}

export const Tabs = Object.assign(TabsRoot, { Tab, Panel });
