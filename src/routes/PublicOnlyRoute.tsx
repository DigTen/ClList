import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="status-box">Φόρτωση συνεδρίας...</div>;
  }

  if (user) {
    return <Navigate to="/payments" replace />;
  }

  return <Outlet />;
}

