import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import { ChevronDown, X } from "lucide-react";

interface FilterDropdownProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function FilterDropdown({ label, options, selected, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const clearAll = () => onChange([]);

  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
          hasSelection
            ? "border-blue-600 bg-blue-600/10 text-blue-400"
            : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600",
        )}
      >
        {label}
        {hasSelection && (
          <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
            {selected.length}
          </span>
        )}
        <ChevronDown className="w-4 h-4 ml-auto" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-40 bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-2 min-w-[200px]">
          {hasSelection && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 w-full px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300"
            >
              <X className="w-3 h-3" />
              Clear all
            </button>
          )}
          {options.map((opt) => (
            <label
              key={opt.value}
              className={clsx(
                "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors",
                selected.includes(opt.value)
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-300 hover:bg-gray-800",
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
