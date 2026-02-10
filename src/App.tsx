import { ReactNode, Suspense, lazy } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { PublicOnlyRoute } from "./routes/PublicOnlyRoute";
import { NavBar } from "./components/NavBar";

const LoginPage = lazy(() => import("./pages/Login").then((module) => ({ default: module.LoginPage })));
const SignupPage = lazy(() => import("./pages/Signup").then((module) => ({ default: module.SignupPage })));
const DashboardPage = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.DashboardPage })));
const PaymentsPage = lazy(() => import("./pages/Payments").then((module) => ({ default: module.PaymentsPage })));
const CalendarPage = lazy(() => import("./pages/Calendar").then((module) => ({ default: module.CalendarPage })));
const SummaryPage = lazy(() => import("./pages/Summary").then((module) => ({ default: module.SummaryPage })));
const OperationsPage = lazy(() => import("./pages/Operations").then((module) => ({ default: module.OperationsPage })));
const ClientProfilePage = lazy(() =>
  import("./pages/ClientProfile").then((module) => ({ default: module.ClientProfilePage })),
);
const AccountPage = lazy(() => import("./pages/Account").then((module) => ({ default: module.AccountPage })));

function RouteFallback() {
  return <div className="status-box">Φόρτωση...</div>;
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

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
    return <RouteFallback />;
  }

  return <Navigate to={user ? "/calendar" : "/login"} replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        <Route element={<PublicOnlyRoute />}>
          <Route
            path="/login"
            element={
              <LazyRoute>
                <LoginPage />
              </LazyRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <LazyRoute>
                <SignupPage />
              </LazyRoute>
            }
          />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route
              path="/dashboard"
              element={
                <LazyRoute>
                  <DashboardPage />
                </LazyRoute>
              }
            />
            <Route
              path="/payments"
              element={
                <LazyRoute>
                  <PaymentsPage />
                </LazyRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <LazyRoute>
                  <CalendarPage />
                </LazyRoute>
              }
            />
            <Route
              path="/summary"
              element={
                <LazyRoute>
                  <SummaryPage />
                </LazyRoute>
              }
            />
            <Route
              path="/operations"
              element={
                <LazyRoute>
                  <OperationsPage />
                </LazyRoute>
              }
            />
            <Route
              path="/clients/:clientId"
              element={
                <LazyRoute>
                  <ClientProfilePage />
                </LazyRoute>
              }
            />
            <Route
              path="/account"
              element={
                <LazyRoute>
                  <AccountPage />
                </LazyRoute>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}