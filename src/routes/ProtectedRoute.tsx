import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="status-box">Φόρτωση συνεδρίας...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

