import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { toast } from "sonner";

export function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      toast.error(error.message);
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      navigate("/payments", { replace: true });
      return;
    }

    toast.success("Έλεγξε το email σου για επιβεβαίωση λογαριασμού.");
    navigate("/login", { replace: true });
  };

  return (
    <div className="auth-page">
      <form className="card stack-sm" onSubmit={handleSubmit}>
        <h2>Δημιουργία λογαριασμού</h2>
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
            minLength={6}
            required
          />
        </label>
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? "Δημιουργία..." : "Δημιουργία λογαριασμού"}
        </button>
        <p className="muted-text">
          Έχεις ήδη λογαριασμό; <Link to="/login">Σύνδεση</Link>
        </p>
      </form>
    </div>
  );
}

