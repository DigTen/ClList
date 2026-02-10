import { FormEvent, useState } from "react";

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = fullName.trim();

    if (!trimmedName) {
      setErrorMessage("Full name is required.");
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
      const message = error instanceof Error ? error.message : "Could not add client.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setIsOpen(true)}>
        Add client
      </button>

      {isOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal">
            <h3>Add client</h3>
            <form className="stack-sm" onSubmit={handleSubmit}>
              <label className="field-label">
                <span>Full name</span>
                <input
                  className="input"
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </label>
              <label className="field-label">
                <span>Phone (optional)</span>
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
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

