import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { toast } from "sonner";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      toast.error(error.message);
      setIsSubmitting(false);
      return;
    }

    navigate("/payments", { replace: true });
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

