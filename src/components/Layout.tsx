import type { ReactNode } from "react";

export interface NavTab {
  id: string;
  label: string;
  icon: ReactNode;
}

const TODAY_ICON = (
  <path d="M8 14l2.2 2.2L16 12M3 9h18M8 2v4M16 2v4M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
);
const HOME_ICON = <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />;
const WORKERS_ICON = (
  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M13 7a4 4 0 11-8 0 4 4 0 018 0zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
);
const SITES_ICON = (
  <path d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
);
const REPORTS_ICON = <path d="M9 19v-6M3 19h18M12 5v8M15 9v6M6 13v2" />;
const MORE_ICON = (
  <path d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.9 1.17V21a2 2 0 11-4 0v-.09A1.65 1.65 0 006 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 002.6 15a1.65 1.65 0 00-1.51-1H1a2 2 0 110-4h.09A1.65 1.65 0 002.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6h.09A1.65 1.65 0 0010 3V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v.09a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
);
const BATA_ICON = (
  <path d="M3 7h18v12H3zM3 7l2-4h14l2 4M9 13h6" />
);
const METER_ICON = (
  <path d="M12 21a8 8 0 108-8M12 13l3-3M4 8h4M4 12h3M5 16h3" />
);

export const OWNER_TABS: NavTab[] = [
  { id: "home", label: "Home", icon: HOME_ICON },
  { id: "workers", label: "Workers", icon: WORKERS_ICON },
  { id: "sites", label: "Sites", icon: SITES_ICON },
  { id: "reports", label: "Reports", icon: REPORTS_ICON },
  { id: "meters", label: "Meters", icon: METER_ICON },
  { id: "settings", label: "More", icon: MORE_ICON },
];

export const SUPERVISOR_TABS: NavTab[] = [
  { id: "attendance", label: "Attendance", icon: TODAY_ICON },
  { id: "bata", label: "Bata", icon: BATA_ICON },
  { id: "meter", label: "Meter", icon: METER_ICON },
];

export function Layout({
  tabs,
  tab,
  onTab,
  title,
  subtitle,
  children,
}: {
  tabs: NavTab[];
  tab: string;
  onTab: (t: string) => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 bg-brand-700 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            {subtitle ? <p className="text-xs text-brand-100">{subtitle}</p> : null}
          </div>
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            Live
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 pb-28">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pt-1.5 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-stretch justify-between">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition ${
                  active ? "text-brand-700" : "text-slate-400"
                }`}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {t.icon}
                </svg>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
