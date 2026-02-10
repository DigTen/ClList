import { useEffect } from "react";
import { lockBodyScroll, unlockBodyScroll } from "../lib/overlay";
import type { Attendance, Client } from "../types/database";

type SessionsDrawerProps = {
  isOpen: boolean;
  date: Date | null;
  sessions: Attendance[];
  clientsById: Record<string, Client>;
  onClose: () => void;
  onAdd: () => void;
  onEdit: (session: Attendance) => void;
  onDelete: (session: Attendance) => void;
};

function formatTime(value: string | null): string {
  if (!value) {
    return "Χωρίς ώρα";
  }
  return value.slice(0, 5);
}

function formatBedType(value: Attendance["bed_type"]): string {
  return value === "cadillac" ? "CADILLAC" : "REFORMER";
}

export function SessionsDrawer({
  isOpen,
  date,
  sessions,
  clientsById,
  onClose,
  onAdd,
  onEdit,
  onDelete,
}: SessionsDrawerProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    lockBodyScroll();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      unlockBodyScroll();
    };
  }, [isOpen, onClose]);

  if (!isOpen || !date) {
    return null;
  }

  const formattedDate = date.toLocaleDateString("el-GR", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const sortedSessions = [...sessions].sort((a, b) => {
    const timeA = a.time_start ?? "";
    const timeB = b.time_start ?? "";
    return timeA.localeCompare(timeB);
  });

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <div className="drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>{formattedDate}</h3>
            <p className="muted-text">{sortedSessions.length} συνεδρίες</p>
          </div>
          <button type="button" className="button" onClick={onClose}>
            Κλείσιμο
          </button>
        </div>

        <button type="button" className="button button-primary" onClick={onAdd}>
          Προσθήκη συνεδρίας
        </button>

        {sortedSessions.length ? (
          <div className="session-list">
            {sortedSessions.map((session) => {
              const clientName = clientsById[session.client_id]?.full_name ?? "Άγνωστος πελάτης";
              return (
                <article key={session.id} className="session-item">
                  <div className="session-row">
                    <div>
                      <strong>{clientName}</strong>
                      <div className="session-meta">
                        {formatTime(session.time_start)} · {formatBedType(session.bed_type)}
                      </div>
                    </div>
                    <span className={`status-pill status-${session.status.replace("_", "-")}`}>
                      {session.status === "attended"
                        ? "παρακολούθησε"
                        : session.status === "canceled"
                          ? "ακυρώθηκε"
                          : "δεν προσήλθε"}
                    </span>
                  </div>
                  {session.notes ? <p className="session-notes">{session.notes}</p> : null}
                  <div className="session-actions">
                    <button type="button" className="button" onClick={() => onEdit(session)}>
                      Επεξεργασία
                    </button>
                    <button type="button" className="button" onClick={() => onDelete(session)}>
                      Διαγραφή
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">Δεν υπάρχουν καταχωρήσεις για αυτή την ημέρα.</div>
        )}
      </div>
    </div>
  );
}
