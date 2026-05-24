import { type ReactNode } from "react";
import { clsx } from "clsx";

interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: ReactNode;
  color?: "blue" | "green" | "yellow" | "red" | "gray";
}

interface TimelineProps {
  events: TimelineEvent[];
}

const dotColors: Record<string, string> = {
  blue: "bg-blue-500 ring-blue-500/30",
  green: "bg-green-500 ring-green-500/30",
  yellow: "bg-yellow-500 ring-yellow-500/30",
  red: "bg-red-500 ring-red-500/30",
  gray: "bg-gray-500 ring-gray-500/30",
};

export default function Timeline({ events }: TimelineProps) {
  return (
    <div className="relative pl-6 space-y-0">
      {events.map((event, idx) => (
        <div key={event.id} className="relative pb-6 last:pb-0">
          <div
            className={clsx(
              "absolute left-[-1.35rem] top-1 w-3 h-3 rounded-full ring-4",
              dotColors[event.color ?? "blue"],
            )}
          />
          {idx < events.length - 1 && (
            <div className="absolute left-[-0.7rem] top-4 bottom-0 w-px bg-gray-800" />
          )}
          <div className="ml-2">
            <div className="flex items-center gap-2">
              {event.icon && <span className="text-gray-500">{event.icon}</span>}
              <p className="text-sm font-medium text-white">{event.title}</p>
            </div>
            {event.description && (
              <p className="text-xs text-gray-400 mt-0.5">{event.description}</p>
            )}
            <p className="text-xs text-gray-600 mt-1">{event.timestamp}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
