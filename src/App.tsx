import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { PublicOnlyRoute } from "./routes/PublicOnlyRoute";
import { LoginPage } from "./pages/Login";
import { SignupPage } from "./pages/Signup";
import { PaymentsPage } from "./pages/Payments";
import { SummaryPage } from "./pages/Summary";
import { NavBar } from "./components/NavBar";

function AppShell() {
  return (
    <>
      <NavBar />
      <main className="container page-content">
        <Outlet />
      </main>
    </>
  );
}

function RootRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="status-box">Loading...</div>;
  }

  return <Navigate to={user ? "/payments" : "/login"} replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/summary" element={<SummaryPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

