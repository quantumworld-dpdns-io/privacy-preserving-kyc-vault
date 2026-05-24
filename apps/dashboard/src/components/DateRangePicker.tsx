import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isWithinInterval, startOfWeek, endOfWeek } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

interface DateRangePickerProps {
  start: Date | null;
  end: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
}

export default function DateRangePicker({ start, end, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(new Date());
  const [selecting, setSelecting] = useState<"start" | "end">("start");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(anchor)),
    end: endOfWeek(endOfMonth(anchor)),
  });

  const handleDay = (day: Date) => {
    if (selecting === "start" || !start) {
      onChange(day, null);
      setSelecting("end");
    } else {
      if (day < start) {
        onChange(day, start);
      } else {
        onChange(start, day);
      }
      setSelecting("start");
    }
  };

  const inRange = (day: Date) => {
    if (!start || !end) return false;
    return isWithinInterval(day, { start, end });
  };

  const display = start && end
    ? `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`
    : start
      ? `${format(start, "MMM d, yyyy")} - ...`
      : "Select date range";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 hover:border-gray-600 transition-colors"
      >
        <Calendar className="w-4 h-4 text-gray-500" />
        {display}
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-40 bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-4 w-[320px]">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setAnchor(subMonths(anchor, 1))} className="p-1 hover:bg-gray-800 rounded">
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <span className="text-sm font-medium text-white">{format(anchor, "MMMM yyyy")}</span>
            <button onClick={() => setAnchor(addMonths(anchor, 1))} className="p-1 hover:bg-gray-800 rounded">
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-xs mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="text-gray-500 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 text-center text-sm">
            {days.map((day) => {
              const isStart = start && isSameDay(day, start);
              const isEnd = end && isSameDay(day, end);
              const range = inRange(day);
              const otherMonth = !isSameMonth(day, anchor);

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleDay(day)}
                  className={clsx(
                    "py-1.5 rounded text-sm transition-colors",
                    otherMonth && "text-gray-700",
                    !otherMonth && "text-gray-300 hover:bg-gray-800",
                    (isStart || isEnd) && "bg-blue-600 text-white hover:bg-blue-700",
                    range && !isStart && !isEnd && "bg-blue-600/20 text-blue-300",
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => { onChange(null, null); setSelecting("start"); }}
            className="mt-3 text-xs text-gray-500 hover:text-gray-300"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
