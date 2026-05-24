import { type ReactNode } from "react";
import { clsx } from "clsx";

interface Tab {
  id: string;
  label: string;
  badge?: number | string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  children?: ReactNode;
}

export default function Tabs({ tabs, active, onChange, children }: TabsProps) {
  return (
    <div>
      <div className="flex border-b border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              active === tab.id
                ? "text-blue-400 border-blue-500"
                : "text-gray-500 border-transparent hover:text-gray-300",
            )}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={clsx(
                  "text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center",
                  active === tab.id
                    ? "bg-blue-600/20 text-blue-400"
                    : "bg-gray-800 text-gray-500",
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      {children && <div className="pt-4">{children}</div>}
    </div>
  );
}
