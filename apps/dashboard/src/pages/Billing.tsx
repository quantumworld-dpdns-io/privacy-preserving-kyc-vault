import { useState, useEffect } from "react";
import { useAPI } from "../hooks/useAPI";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface UsageStats {
  currentMonthRequests: number;
  storageUsedGB: number;
  activeUsers: number;
  monthlyCost: number;
}

const usageHistory = [
  { month: "Jan", requests: 4200, cost: 210 },
  { month: "Feb", requests: 5600, cost: 280 },
  { month: "Mar", requests: 3800, cost: 190 },
  { month: "Apr", requests: 7100, cost: 355 },
  { month: "May", requests: 6300, cost: 315 },
  { month: "Jun", requests: 8900, cost: 445 },
];

export default function Billing() {
  const api = useAPI();
  const [stats, setStats] = useState<UsageStats>({
    currentMonthRequests: 8900,
    storageUsedGB: 142,
    activeUsers: 1247,
    monthlyCost: 445,
  });

  useEffect(() => {
    api.get("/admin/billing/usage").then(setStats).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Billing & Usage</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Current Month Requests</p>
          <p className="text-2xl font-bold mt-1">{stats.currentMonthRequests.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Storage Used</p>
          <p className="text-2xl font-bold mt-1">{stats.storageUsedGB} GB</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Active Users</p>
          <p className="text-2xl font-bold mt-1">{stats.activeUsers.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Monthly Cost</p>
          <p className="text-2xl font-bold mt-1">${stats.monthlyCost}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-lg font-semibold mb-4">Request Usage</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={usageHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ background: "#1f2937", border: "none" }} />
              <Bar dataKey="requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-lg font-semibold mb-4">Monthly Cost</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={usageHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ background: "#1f2937", border: "none" }} />
              <Area type="monotone" dataKey="cost" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h2 className="text-lg font-semibold mb-4">Current Plan</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold">Pro Plan</p>
            <p className="text-sm text-gray-400 mt-1">$0.05 per verification + $0.02 per credential issue</p>
          </div>
          <button className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Change Plan
          </button>
        </div>
      </div>
    </div>
  );
}
