import { useEffect, useState } from 'react';
import { kycClient } from '../lib/kyc-client';
import type { KYCWorkflow, CredentialSummary, FraudReport, ComplianceStatus } from '../lib/kyc-client';

interface DashboardData {
  activeWorkflows: number;
  verifiedToday: number;
  fraudRate: number;
  pendingReviews: number;
  workflows: KYCWorkflow[];
  credentials: CredentialSummary[];
  compliance: ComplianceStatus;
}

export default function KYCDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [workflows, credentials, compliance] = await Promise.all([
        kycClient.listWorkflows({ status: 'pending' }),
        kycClient.listCredentials({ limit: 10 }),
        kycClient.getComplianceStatus(),
      ]);
      setData({
        activeWorkflows: workflows.length,
        verifiedToday: workflows.filter(w => w.status === 'verified').length,
        fraudRate: workflows.filter(w => w.fraudScore > 0.7).length / Math.max(workflows.length, 1),
        pendingReviews: workflows.filter(w => w.status === 'pending_review').length,
        workflows,
        credentials,
        compliance,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="p-8 text-gray-400">Loading dashboard...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-purple-400">KYC Admin Portal</h1>
        <p className="text-gray-400 mt-1">
          Compliance jurisdiction: <span className="text-green-400">{data?.compliance.jurisdiction}</span>
          {' | '}Last audit: <span className="text-cyan-400">{data?.compliance.lastAuditDate}</span>
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Active Workflows" value={data?.activeWorkflows ?? 0} color="text-blue-400" />
        <StatCard title="Verified Today" value={data?.verifiedToday ?? 0} color="text-green-400" />
        <StatCard title="Fraud Rate" value={`${((data?.fraudRate ?? 0) * 100).toFixed(1)}%`} color="text-red-400" />
        <StatCard title="Pending Review" value={data?.pendingReviews ?? 0} color="text-yellow-400" />
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Recent Workflows</h2>
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-700 text-gray-300">
              <tr>
                <th className="p-3 text-left">ID</th>
                <th className="p-3 text-left">Applicant</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Fraud Score</th>
                <th className="p-3 text-left">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data?.workflows.map(w => (
                <tr key={w.id} className="border-t border-gray-700 hover:bg-gray-750">
                  <td className="p-3 font-mono text-xs">{w.id.slice(0, 16)}...</td>
                  <td className="p-3">{w.applicantId}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${statusColor(w.status)}`}>{w.status}</span>
                  </td>
                  <td className="p-3">{w.fraudScore.toFixed(2)}</td>
                  <td className="p-3 text-gray-400">{new Date(w.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Recent Credentials</h2>
        <div className="bg-gray-800 rounded-lg p-4">
          {data?.credentials.map(c => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
              <div>
                <span className="font-mono text-xs text-gray-400">{c.id}</span>
                <p className="text-sm">{c.type.join(', ')}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${c.valid ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                {c.valid ? 'Valid' : 'Revoked'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-yellow-900 text-yellow-300',
    verified: 'bg-green-900 text-green-300',
    rejected: 'bg-red-900 text-red-300',
    pending_review: 'bg-blue-900 text-blue-300',
    failed: 'bg-red-900 text-red-300',
  };
  return map[status] || 'bg-gray-700 text-gray-300';
}
