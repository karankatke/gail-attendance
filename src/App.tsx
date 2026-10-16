import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { isConfigured } from "./lib/env";
import { Layout, OWNER_TABS, SUPERVISOR_TABS } from "./components/Layout";
import { LoginScreen } from "./components/LoginScreen";
import { SetupScreen } from "./components/SetupScreen";
import { Spinner } from "./components/ui";
import { HomePage } from "./pages/Home";
import { WorkersPage } from "./pages/Workers";
import { SitesPage } from "./pages/Sites";
import { ReportsPage } from "./pages/Reports";
import { SettingsPage } from "./pages/Settings";
import { SupervisorAttendancePage } from "./pages/SupervisorAttendance";
import { BataPage } from "./pages/Bata";

const OWNER_TITLES: Record<string, { title: string; subtitle?: string }> = {
  home: { title: "Home", subtitle: "Today at a glance" },
  workers: { title: "Workers", subtitle: "People and their rates" },
  sites: { title: "Sites", subtitle: "Where work happens" },
  reports: { title: "Reports", subtitle: "Wages, payments & bata" },
  settings: { title: "More", subtitle: "Roles, access, settings" },
};

const SUPERVISOR_TITLES: Record<string, { title: string; subtitle?: string }> = {
  attendance: { title: "Attendance", subtitle: "Mark who worked, where" },
  bata: { title: "Bata", subtitle: "Cash given and spent" },
};

function OwnerApp() {
  const [tab, setTab] = useState("home");
  const meta = OWNER_TITLES[tab] ?? OWNER_TITLES.home;
  return (
    <Layout tabs={OWNER_TABS} tab={tab} onTab={setTab} title={meta.title} subtitle={meta.subtitle}>
      {tab === "home" ? <HomePage /> : null}
      {tab === "workers" ? <WorkersPage /> : null}
      {tab === "sites" ? <SitesPage /> : null}
      {tab === "reports" ? <ReportsPage /> : null}
      {tab === "settings" ? <SettingsPage /> : null}
    </Layout>
  );
}

function SupervisorApp() {
  const [tab, setTab] = useState("attendance");
  const meta = SUPERVISOR_TITLES[tab] ?? SUPERVISOR_TITLES.attendance;
  return (
    <Layout tabs={SUPERVISOR_TABS} tab={tab} onTab={setTab} title={meta.title} subtitle={meta.subtitle}>
      {tab === "attendance" ? <SupervisorAttendancePage /> : null}
      {tab === "bata" ? <BataPage /> : null}
    </Layout>
  );
}

function Root() {
  const { ready, signedIn, profile } = useAuth();
  if (!isConfigured) return <SetupScreen />;
  if (!ready) return <Spinner />;
  if (!signedIn || !profile) return <LoginScreen />;
  return profile.role === "owner" ? <OwnerApp /> : <SupervisorApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
