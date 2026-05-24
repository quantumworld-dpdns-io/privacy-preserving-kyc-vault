import { useState, useEffect } from "react";
import { useAPI } from "../hooks/useAPI";
import StatusBadge from "../components/StatusBadge";
import { Plus, Copy, Check } from "lucide-react";

interface Credential {
  id: string;
  userId: string;
  type: string;
  status: "active" | "expired" | "revoked";
  issuedAt: string;
  expiresAt: string;
}

export default function Credentials() {
  const api = useAPI();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/admin/credentials").then(setCreds).catch(console.error);
  }, []);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Credentials</h1>
        <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <Plus className="w-4 h-4" /> Issue Credential
        </button>
      </div>

      <div className="grid gap-4">
        {creds.map((cred) => (
          <div key={cred.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-gray-400">{cred.id}</span>
                <button onClick={() => handleCopy(cred.id)} className="text-gray-500 hover:text-gray-300">
                  {copiedId === cred.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
                <StatusBadge status={cred.status} />
              </div>
              <p className="text-sm text-gray-400">
                {cred.type} &middot; Issued {new Date(cred.issuedAt).toLocaleDateString()}
                {cred.expiresAt && ` &middot; Expires ${new Date(cred.expiresAt).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="text-xs text-gray-400 hover:text-white px-3 py-1.5 border border-gray-700 rounded-md">Verify</button>
              <button className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 border border-gray-700 rounded-md">Revoke</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
