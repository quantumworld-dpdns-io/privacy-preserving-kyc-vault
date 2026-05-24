import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  type TooltipProps,
} from "recharts";
import { clsx } from "clsx";

type ChartKind = "bar" | "line" | "pie" | "area";

interface ChartSeries {
  key: string;
  color?: string;
  name?: string;
}

interface ChartProps {
  type: ChartKind;
  data: Record<string, unknown>[];
  series: ChartSeries[];
  xKey?: string;
  title?: string;
  className?: string;
  height?: number;
}

const DEFAULT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function Chart({ type, data, series, xKey = "name", title, className, height = 300 }: ChartProps) {
  const renderChart = () => {
    switch (type) {
      case "bar":
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey={xKey} stroke="#6b7280" tick={{ fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]} name={s.name ?? s.key} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );

      case "line":
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey={xKey} stroke="#6b7280" tick={{ fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
            {series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} name={s.name ?? s.key} />
            ))}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey={xKey} stroke="#6b7280" tick={{ fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
            {series.map((s, i) => (
              <Area key={s.key} type="monotone" dataKey={s.key} fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]} stroke={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]} fillOpacity={0.2} strokeWidth={2} name={s.name ?? s.key} />
            ))}
          </AreaChart>
        );

      case "pie":
        return (
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
            {series.map((s, i) => (
              <Pie key={s.key} data={data as unknown as Record<string, unknown>[]} dataKey={s.key} nameKey={xKey} cx="50%" cy="50%" outerRadius={80} fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {data.map((_, idx) => (
                  <Cell key={`cell-${idx}`} fill={DEFAULT_COLORS[idx % DEFAULT_COLORS.length]} />
                ))}
              </Pie>
            ))}
          </PieChart>
        );
    }
  };

  return (
    <div className={clsx("bg-gray-900 rounded-lg border border-gray-800 p-4", className)}>
      {title && <h3 className="text-sm font-semibold text-gray-300 mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
