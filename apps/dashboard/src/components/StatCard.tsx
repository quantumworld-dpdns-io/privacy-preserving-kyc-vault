import { type ReactNode } from "react";
import { clsx } from "clsx";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  icon?: ReactNode;
  label: string;
  value: string | number;
  trend?: "up" | "down";
  trendValue?: string;
  color?: "blue" | "green" | "yellow" | "red" | "purple";
}

const colorClasses: Record<string, string> = {
  blue: "bg-blue-600/10 text-blue-400 border-blue-600/20",
  green: "bg-green-600/10 text-green-400 border-green-600/20",
  yellow: "bg-yellow-600/10 text-yellow-400 border-yellow-600/20",
  red: "bg-red-600/10 text-red-400 border-red-600/20",
  purple: "bg-purple-600/10 text-purple-400 border-purple-600/20",
};

const iconBg: Record<string, string> = {
  blue: "bg-blue-600/20",
  green: "bg-green-600/20",
  yellow: "bg-yellow-600/20",
  red: "bg-red-600/20",
  purple: "bg-purple-600/20",
};

export default function StatCard({ icon, label, value, trend, trendValue, color = "blue" }: StatCardProps) {
  return (
    <div className={clsx("rounded-lg border p-4", colorClasses[color])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm opacity-80">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {trend && (
            <span className={clsx("text-xs flex items-center gap-0.5 mt-1", trend === "up" ? "text-green-400" : "text-red-400")}>
              {trend === "up" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {trendValue}
            </span>
          )}
        </div>
        {icon && (
          <div className={clsx("p-2 rounded-lg", iconBg[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
