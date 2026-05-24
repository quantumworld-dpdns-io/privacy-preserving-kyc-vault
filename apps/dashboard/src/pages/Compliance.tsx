import { useState } from "react";
import { useAPI } from "../hooks/useAPI";
import { Download, FileText } from "lucide-react";

const reportTypes = [
  { id: "kyc-summary", label: "KYC Summary Report" },
  { id: "credential-activity", label: "Credential Activity Report" },
  { id: "platform-audit", label: "Platform Audit Report" },
  { id: "data-retention", label: "Data Retention Report" },
  { id: "gdpr", label: "GDPR Compliance Report" },
  { id: "ccpa", label: "CCPA Compliance Report" },
];

export default function Compliance() {
  const api = useAPI();
  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerate = async (reportId: string) => {
    setGenerating(reportId);
    try {
      const blob = await api.getBlob(`/admin/compliance/${reportId}/export`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportId}-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Compliance Reports</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportTypes.map((report) => (
          <div key={report.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="font-medium text-sm">{report.label}</h3>
            </div>
            <button
              onClick={() => handleGenerate(report.id)}
              disabled={generating === report.id}
              className="mt-auto flex items-center justify-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              {generating === report.id ? "Generating..." : "Export CSV"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
