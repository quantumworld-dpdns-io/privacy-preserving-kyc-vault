import { useState, useEffect } from "react";
import { useAPI } from "../hooks/useAPI";
import { Globe, Plus, Trash2 } from "lucide-react";

interface Platform {
  id: string;
  name: string;
  url: string;
  status: "active" | "inactive";
  connectedAt: string;
}

export default function Platforms() {
  const api = useAPI();
  const [platforms, setPlatforms] = useState<Platform[]>([]);

  useEffect(() => {
    api.get("/admin/platforms").then(setPlatforms).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Platforms</h1>
        <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Platform
        </button>
      </div>

      <div className="grid gap-4">
        {platforms.map((p) => (
          <div key={p.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-medium">{p.name}</h3>
                <p className="text-sm text-gray-400">{p.url}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full ${
                p.status === "active"
                  ? "bg-green-900/50 text-green-400"
                  : "bg-gray-800 text-gray-400"
              }`}>
                {p.status}
              </span>
              <span className="text-xs text-gray-500">
                Connected {new Date(p.connectedAt).toLocaleDateString()}
              </span>
              <button className="text-gray-500 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
