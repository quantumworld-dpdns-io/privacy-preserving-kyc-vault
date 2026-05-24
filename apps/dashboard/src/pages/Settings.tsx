import { useState } from "react";
import { useAPI } from "../hooks/useAPI";
import { Save } from "lucide-react";

export default function Settings() {
  const api = useAPI();
  const [settings, setSettings] = useState({
    requireBiometric: false,
    livenessCheck: true,
    documentRetentionDays: 90,
    maxAttempts: 3,
    webhookUrl: "",
    autoApproveTrustedPlatforms: false,
  });

  const handleSave = async () => {
    await api.post("/admin/settings", settings);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">System Settings</h1>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Verification Rules</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm">Require Biometric Verification</span>
              <input
                type="checkbox"
                checked={settings.requireBiometric}
                onChange={(e) => setSettings({ ...settings, requireBiometric: e.target.checked })}
                className="rounded bg-gray-800 border-gray-600"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm">Liveness Detection</span>
              <input
                type="checkbox"
                checked={settings.livenessCheck}
                onChange={(e) => setSettings({ ...settings, livenessCheck: e.target.checked })}
                className="rounded bg-gray-800 border-gray-600"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm">Auto-Approve from Trusted Platforms</span>
              <input
                type="checkbox"
                checked={settings.autoApproveTrustedPlatforms}
                onChange={(e) => setSettings({ ...settings, autoApproveTrustedPlatforms: e.target.checked })}
                className="rounded bg-gray-800 border-gray-600"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-6">
          <h2 className="text-lg font-semibold mb-4">Retention & Limits</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Document Retention (days)</label>
              <input
                type="number"
                value={settings.documentRetentionDays}
                onChange={(e) => setSettings({ ...settings, documentRetentionDays: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Max Verification Attempts</label>
              <input
                type="number"
                value={settings.maxAttempts}
                onChange={(e) => setSettings({ ...settings, maxAttempts: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-6">
          <h2 className="text-lg font-semibold mb-4">Webhook</h2>
          <div>
            <label className="block text-sm mb-1">Webhook URL</label>
            <input
              type="url"
              value={settings.webhookUrl}
              onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
              placeholder="https://..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Save className="w-4 h-4" /> Save Settings
        </button>
      </div>
    </div>
  );
}
