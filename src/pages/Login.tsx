import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { toast } from "sonner";
import { checkLoginLock, recordLoginAttempt } from "../lib/data";

function formatRemainingLock(seconds: number): string {
  const remainingMinutes = Math.max(1, Math.ceil(seconds / 60));
  return `${remainingMinutes} λεπτά`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const lockState = await checkLoginLock(normalizedEmail);
      if (lockState.isLocked) {
        toast.error(`Ο λογαριασμός είναι προσωρινά κλειδωμένος για ${formatRemainingLock(lockState.remainingSeconds)}.`);
        setIsSubmitting(false);
        return;
      }
    } catch {
      toast.error("Δεν ήταν δυνατός ο έλεγχος ασφαλείας σύνδεσης.");
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      try {
        const failureState = await recordLoginAttempt(normalizedEmail, false);
        if (failureState.isLocked) {
          toast.error(
            `Ο λογαριασμός κλειδώθηκε για ${failureState.lockMinutes} λεπτά λόγω αποτυχημένων προσπαθειών.`,
          );
        } else {
          const remainingAttempts = Math.max(0, 3 - failureState.failCount);
          toast.error(
            remainingAttempts > 0
              ? `Λάθος στοιχεία. Απομένουν ${remainingAttempts} προσπάθειες πριν το κλείδωμα.`
              : "Λάθος στοιχεία σύνδεσης.",
          );
        }
      } catch {
        toast.error(error.message);
      }
      setIsSubmitting(false);
      return;
    }

    try {
      await recordLoginAttempt(normalizedEmail, true);
    } catch {
      // Do not block successful login if the reset call fails.
    }

    navigate("/calendar", { replace: true });
  };

  return (
    <div className="auth-page">
      <form className="card stack-sm" onSubmit={handleSubmit}>
        <h2>Σύνδεση</h2>
        <label className="field-label">
          <span>Ηλεκτρονικό ταχυδρομείο</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field-label">
          <span>Κωδικός</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? "Σύνδεση..." : "Σύνδεση"}
        </button>
        <p className="muted-text">
          Δεν έχεις λογαριασμό; <Link to="/signup">Δημιούργησε</Link>
        </p>
      </form>
    </div>
  );
}

