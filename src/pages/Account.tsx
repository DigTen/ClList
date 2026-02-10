import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabaseClient";

export function AccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);

  useEffect(() => {
    setDisplayName(typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "");
  }, [user]);

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingProfile(true);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: displayName.trim() || null,
        },
      });

      if (error) {
        throw error;
      }

      toast.success("Το προφίλ ενημερώθηκε.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η ενημέρωση προφίλ.";
      toast.error(message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword.length < 6) {
      toast.error("Ο νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Οι κωδικοί δεν ταιριάζουν.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      setNewPassword("");
      setConfirmPassword("");
      toast.success("Ο κωδικός ενημερώθηκε.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η αλλαγή κωδικού.";
      toast.error(message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSignOutAllSessions = async () => {
    if (!window.confirm("Να γίνει αποσύνδεση από όλες τις συσκευές;")) {
      return;
    }

    setIsSigningOutAll(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) {
        throw error;
      }

      toast.success("Έγινε αποσύνδεση από όλες τις συσκευές.");
      navigate("/login", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η αποσύνδεση από όλες τις συσκευές.";
      toast.error(message);
    } finally {
      setIsSigningOutAll(false);
    }
  };

  return (
    <section className="stack-md">
      <article className="card stack-sm">
        <h2>Λογαριασμός</h2>
        <p className="muted-text">Email: {user?.email ?? "-"}</p>
        <p className="muted-text">Αναγνωριστικό χρήστη: {user?.id ?? "-"}</p>
      </article>

      <article className="card stack-sm">
        <h3>Στοιχεία προφίλ</h3>
        <form className="stack-sm" onSubmit={handleSaveProfile}>
          <label className="field-label">
            <span>Όνομα εμφάνισης</span>
            <input
              className="input"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Προαιρετικό"
            />
          </label>
          <div>
            <button type="submit" className="button button-primary" disabled={isSavingProfile}>
              {isSavingProfile ? "Αποθήκευση..." : "Αποθήκευση προφίλ"}
            </button>
          </div>
        </form>
      </article>

      <article className="card stack-sm">
        <h3>Ασφάλεια</h3>
        <form className="stack-sm" onSubmit={handleChangePassword}>
          <label className="field-label">
            <span>Νέος κωδικός</span>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>
          <label className="field-label">
            <span>Επιβεβαίωση νέου κωδικού</span>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>
          <div className="row gap-sm wrap">
            <button type="submit" className="button button-primary" disabled={isSavingPassword}>
              {isSavingPassword ? "Αλλαγή..." : "Αλλαγή κωδικού"}
            </button>
            <button type="button" className="button" onClick={() => void handleSignOutAllSessions()} disabled={isSigningOutAll}>
              {isSigningOutAll ? "Αποσύνδεση..." : "Αποσύνδεση από όλες τις συσκευές"}
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
