import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import KYCRequests from "./pages/KYCRequests";
import Credentials from "./pages/Credentials";
import Platforms from "./pages/Platforms";
import Settings from "./pages/Settings";
import AuditLog from "./pages/AuditLog";
import Compliance from "./pages/Compliance";
import Billing from "./pages/Billing";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/kyc-requests" element={<KYCRequests />} />
        <Route path="/credentials" element={<Credentials />} />
        <Route path="/platforms" element={<Platforms />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
