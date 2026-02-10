import { FormEvent, useEffect, useState } from "react";
import { lockBodyScroll, unlockBodyScroll } from "../lib/overlay";

type AddClientDialogProps = {
  onAddClient: (input: { fullName: string; phone: string | null }) => Promise<void>;
};

export function AddClientDialog({ onAddClient }: AddClientDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reset = () => {
    setFullName("");
    setPhone("");
    setErrorMessage(null);
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    setIsOpen(false);
    reset();
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    lockBodyScroll();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      unlockBodyScroll();
    };
  }, [isOpen, isSubmitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = fullName.trim();

    if (!trimmedName) {
      setErrorMessage("Το ονοματεπώνυμο είναι υποχρεωτικό.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onAddClient({
        fullName: trimmedName,
        phone: phone.trim() ? phone.trim() : null,
      });
      setIsOpen(false);
      reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η προσθήκη πελάτη.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setIsOpen(true)}>
        Προσθήκη πελάτη
      </button>

      {isOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={handleClose}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Προσθήκη πελάτη"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Προσθήκη πελάτη</h3>
            <form className="stack-sm" onSubmit={handleSubmit}>
              <label className="field-label">
                <span>Ονοματεπώνυμο</span>
                <input
                  className="input"
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </label>
              <label className="field-label">
                <span>Τηλέφωνο (προαιρετικό)</span>
                <input
                  className="input"
                  type="text"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
              {errorMessage ? <p className="text-error">{errorMessage}</p> : null}
              <div className="row gap-sm align-end">
                <button type="button" className="button" onClick={handleClose} disabled={isSubmitting}>
                  Ακύρωση
                </button>
                <button type="submit" className="button button-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Αποθήκευση..." : "Αποθήκευση πελάτη"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

