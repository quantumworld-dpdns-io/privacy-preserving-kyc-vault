import { useState, useEffect } from "react";
import { useAPI } from "../hooks/useAPI";
import { Search, ChevronDown } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  details: string;
}

export default function AuditLog() {
  const api = useAPI();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/admin/audit-log").then(setLogs).catch(console.error);
  }, []);

  const filtered = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.actor.toLowerCase().includes(search.toLowerCase()) ||
      l.target.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search audit entries..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <span className="bg-gray-800 text-xs px-2 py-1 rounded-md font-mono">
                    {entry.action}
                  </span>
                </td>
                <td className="px-4 py-3">{entry.actor}</td>
                <td className="px-4 py-3 font-mono text-xs">{entry.target}</td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(entry.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{entry.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
