import { clsx } from "clsx";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: number | string;
  color?: "green" | "yellow" | "red" | "default";
  trend?: "up" | "down";
  trendValue?: string;
}

const colorStyles: Record<string, string> = {
  green: "text-green-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  default: "text-white",
};

export default function MetricCard({ title, value, color = "default", trend, trendValue }: MetricCardProps) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <p className="text-sm text-gray-400">{title}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className={clsx("text-2xl font-bold", colorStyles[color])}>{value}</p>
        {trend && (
          <span className={clsx("text-xs flex items-center gap-0.5", trend === "up" ? "text-green-400" : "text-red-400")}>
            {trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trendValue}
          </span>
        )}
      </div>
    </div>
  );
}
