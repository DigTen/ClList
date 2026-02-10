import { FormEvent, useEffect, useMemo, useState } from "react";
import { toIsoDate } from "../lib/date";
import { lockBodyScroll, unlockBodyScroll } from "../lib/overlay";
import type {
  Attendance,
  AttendanceBedType,
  AttendanceInsert,
  AttendanceStatus,
  Client,
} from "../types/database";

const HOUR_OPTIONS = Array.from({ length: 15 }, (_, index) => `${String(8 + index).padStart(2, "0")}:00`);
const BED_CAPACITY = 4;

type BedLoadByHour = Record<string, Record<AttendanceBedType, number>>;

type AddSessionDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: AttendanceInsert, existingId?: string) => Promise<void>;
  userId: string;
  clients: Client[];
  initialDate: Date;
  initialTime?: string;
  initialBedType?: AttendanceBedType;
  initialSession?: Attendance | null;
  bedLoadByHour: BedLoadByHour;
};

function getHourBucket(timeValue: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(timeValue)) {
    return null;
  }
  return `${timeValue.slice(0, 2)}:00`;
}

function getDefaultBedLoad(): Record<AttendanceBedType, number> {
  return {
    reformer: 0,
    cadillac: 0,
  };
}

export function AddSessionDialog({
  isOpen,
  onClose,
  onSave,
  userId,
  clients,
  initialDate,
  initialTime,
  initialBedType,
  initialSession,
  bedLoadByHour,
}: AddSessionDialogProps) {
  const [clientId, setClientId] = useState("");
  const [sessionDate, setSessionDate] = useState(toIsoDate(initialDate));
  const [timeStart, setTimeStart] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [bedType, setBedType] = useState<AttendanceBedType>("reformer");
  const [status, setStatus] = useState<AttendanceStatus>("attended");
  const [notes, setNotes] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (initialSession) {
      setClientId(initialSession.client_id);
      setSessionDate(initialSession.session_date);
      setTimeStart(initialSession.time_start ? initialSession.time_start.slice(0, 5) : "");
      setDurationMinutes(
        initialSession.duration_minutes != null ? String(initialSession.duration_minutes) : "",
      );
      setBedType(initialSession.bed_type ?? "reformer");
      setStatus(initialSession.status);
      setNotes(initialSession.notes ?? "");
    } else {
      setClientId("");
      setSessionDate(toIsoDate(initialDate));
      setTimeStart(initialTime ?? "08:00");
      setDurationMinutes("");
      setBedType(initialBedType ?? "reformer");
      setStatus("attended");
      setNotes("");
    }
    setClientFilter("");
    setErrorMessage(null);
  }, [initialBedType, initialDate, initialSession, initialTime, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    lockBodyScroll();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      unlockBodyScroll();
    };
  }, [isOpen, isSubmitting, onClose]);

  const filteredClients = useMemo(() => {
    const normalized = clientFilter.trim().toLowerCase();
    const base = normalized
      ? clients.filter((client) => client.full_name.toLowerCase().includes(normalized))
      : clients;
    if (clientId && !base.some((client) => client.id === clientId)) {
      const selected = clients.find((client) => client.id === clientId);
      return selected ? [selected, ...base] : base;
    }
    return base;
  }, [clientFilter, clients, clientId]);

  const timeOptions = useMemo(() => {
    const options = HOUR_OPTIONS.map((value) => ({ value, isLegacy: false }));
    if (timeStart && !HOUR_OPTIONS.includes(timeStart)) {
      options.unshift({ value: timeStart, isLegacy: true });
    }
    return options;
  }, [timeStart]);

  const bedLoadByType = useMemo(() => {
    if (timeStart in bedLoadByHour) {
      return bedLoadByHour[timeStart];
    }

    const bucket = getHourBucket(timeStart);
    if (bucket && bucket in bedLoadByHour) {
      return bedLoadByHour[bucket];
    }

    return getDefaultBedLoad();
  }, [bedLoadByHour, timeStart]);

  const selectedBedLoad = bedLoadByType[bedType] ?? 0;

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!clientId) {
      setErrorMessage("Επίλεξε πελάτη.");
      return;
    }

    const trimmedDate = sessionDate.trim();
    if (!trimmedDate) {
      setErrorMessage("Η ημερομηνία είναι υποχρεωτική.");
      return;
    }

    const trimmedTime = timeStart.trim();
    if (!trimmedTime) {
      setErrorMessage("Η ώρα είναι υποχρεωτική.");
      return;
    }

    if (!timeOptions.some((option) => option.value === trimmedTime)) {
      setErrorMessage("Η ώρα πρέπει να είναι ακριβής ώρα μεταξύ 08:00 και 22:00.");
      return;
    }

    const parsedDuration = durationMinutes.trim()
      ? Number.parseInt(durationMinutes.trim(), 10)
      : null;
    if (parsedDuration != null && (!Number.isFinite(parsedDuration) || parsedDuration < 0)) {
      setErrorMessage("Η διάρκεια πρέπει να είναι θετικός αριθμός.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const payload: AttendanceInsert = {
        user_id: userId,
        client_id: clientId,
        session_date: trimmedDate,
        time_start: trimmedTime,
        duration_minutes: parsedDuration,
        bed_type: bedType,
        status,
        notes: notes.trim() ? notes.trim() : null,
      };

      await onSave(payload, initialSession?.id);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η αποθήκευση συνεδρίας.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={initialSession ? "Επεξεργασία συνεδρίας" : "Προσθήκη συνεδρίας"}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{initialSession ? "Επεξεργασία συνεδρίας" : "Προσθήκη συνεδρίας"}</h3>
        <form className="stack-sm" onSubmit={handleSubmit}>
          <label className="field-label">
            <span>Αναζήτηση πελάτη</span>
            <input
              className="input"
              type="text"
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              placeholder="Πληκτρολόγησε για φιλτράρισμα..."
            />
          </label>
          <label className="field-label">
            <span>Πελάτης</span>
            <select className="input" value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Επίλεξε πελάτη</option>
              {filteredClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>Ημερομηνία</span>
            <input
              className="input"
              type="date"
              value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)}
              required
            />
          </label>
          <label className="field-label">
            <span>Ώρα</span>
            <select className="input" value={timeStart} onChange={(event) => setTimeStart(event.target.value)} required>
              <option value="">Επίλεξε ώρα</option>
              {timeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.isLegacy ? `${option.value} (υπάρχουσα ώρα)` : option.value}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>Κρεβάτι</span>
            <select
              className="input"
              value={bedType}
              onChange={(event) => setBedType(event.target.value as AttendanceBedType)}
            >
              <option value="reformer">REFORMER ({bedLoadByType.reformer}/{BED_CAPACITY})</option>
              <option value="cadillac">CADILLAC ({bedLoadByType.cadillac}/{BED_CAPACITY})</option>
            </select>
            <span className={selectedBedLoad > BED_CAPACITY ? "text-error" : "muted-text"}>
              Πληρότητα επιλεγμένου κρεβατιού: {selectedBedLoad}/{BED_CAPACITY}
              {selectedBedLoad > BED_CAPACITY ? " (υπερπλήρες)" : ""}
            </span>
          </label>
          <label className="field-label">
            <span>Διάρκεια (λεπτά, προαιρετικό)</span>
            <input
              className="input"
              type="number"
              min={0}
              step={5}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />
          </label>
          <label className="field-label">
            <span>Κατάσταση</span>
            <select
              className="input"
              value={status}
              onChange={(event) => setStatus(event.target.value as AttendanceStatus)}
            >
              <option value="attended">Παρακολούθησε</option>
              <option value="canceled">Ακυρώθηκε</option>
              <option value="no_show">Δεν προσήλθε</option>
            </select>
          </label>
          <label className="field-label">
            <span>Σημειώσεις (προαιρετικό)</span>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {errorMessage ? <p className="text-error">{errorMessage}</p> : null}
          <div className="row gap-sm align-end">
            <button type="button" className="button" onClick={handleClose} disabled={isSubmitting}>
              Ακύρωση
            </button>
            <button type="submit" className="button button-primary" disabled={isSubmitting}>
              {isSubmitting ? "Αποθήκευση..." : "Αποθήκευση συνεδρίας"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
