import { useState, useEffect } from "react";
import MetricCard from "../components/MetricCard";
import { useAPI } from "../hooks/useAPI";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#22c55e", "#eab308", "#ef4444", "#6b7280"];

export default function Dashboard() {
  const api = useAPI();
  const [metrics, setMetrics] = useState({
    totalRequests: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    activeCredentials: 0,
    connectedPlatforms: 0,
  });

  useEffect(() => {
    api.get("/admin/metrics").then(setMetrics).catch(console.error);
  }, []);

  const statusData = [
    { name: "Approved", value: metrics.approved },
    { name: "Pending", value: metrics.pending },
    { name: "Rejected", value: metrics.rejected },
  ];

  const volumeData = [
    { month: "Jan", requests: 42 },
    { month: "Feb", requests: 56 },
    { month: "Mar", requests: 38 },
    { month: "Apr", requests: 71 },
    { month: "May", requests: 63 },
    { month: "Jun", requests: 89 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Requests" value={metrics.totalRequests} />
        <MetricCard title="Approved" value={metrics.approved} color="green" />
        <MetricCard title="Pending Review" value={metrics.pending} color="yellow" />
        <MetricCard title="Rejected" value={metrics.rejected} color="red" />
        <MetricCard title="Active Credentials" value={metrics.activeCredentials} />
        <MetricCard title="Connected Platforms" value={metrics.connectedPlatforms} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">KYC Volume (6 months)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ background: "#1f2937", border: "none" }} />
              <Bar dataKey="requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">Request Status Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
              >
                {statusData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1f2937", border: "none" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
