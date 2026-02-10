import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { toast } from "sonner";
import { useState } from "react";

export function NavBar() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η αποσύνδεση.";
      toast.error(message);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header className="top-nav">
      <div className="container row space-between align-center">
        <div className="row gap-md align-center">
          <h1 className="app-title">Πληρωμές Pilates</h1>
          <nav className="row gap-sm">
            <NavLink
              to="/payments"
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              Πληρωμές
            </NavLink>
            <NavLink
              to="/calendar"
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              Ημερολόγιο
            </NavLink>
            <NavLink
              to="/summary"
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              Σύνοψη
            </NavLink>
          </nav>
        </div>
        <div className="row gap-sm align-center">
          <span className="muted-text">{user?.email}</span>
          <button
            type="button"
            className="button"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Αποσύνδεση..." : "Αποσύνδεση"}
          </button>
        </div>
      </div>
    </header>
  );
}

