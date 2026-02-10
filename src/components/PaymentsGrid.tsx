import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Client, Payment } from "../types/database";

export type PaymentDraft = {
  lessons: string;
  price: string;
  paid: boolean;
  notes: string;
};

export type PaymentGridRow = {
  client: Client;
  payment?: Payment;
};

export type SaveStatus = "saving" | "saved" | "error";

type PaymentsGridProps = {
  rows: PaymentGridRow[];
  saveStatusByClientId: Record<string, SaveStatus>;
  onSave: (clientId: string, draft: PaymentDraft) => Promise<void>;
};

function paymentToDraft(payment?: Payment): PaymentDraft {
  return {
    lessons: payment?.lessons != null ? String(payment.lessons) : "",
    price: payment?.price != null ? String(payment.price) : "",
    paid: payment?.paid ?? false,
    notes: payment?.notes ?? "",
  };
}

function draftsEqual(a: PaymentDraft, b: PaymentDraft): boolean {
  return a.lessons === b.lessons && a.price === b.price && a.paid === b.paid && a.notes === b.notes;
}

function focusNextGridControl(current: HTMLElement) {
  const controls = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".payments-grid input, .payments-grid textarea, .payments-grid select, .payments-grid button",
    ),
  ).filter((element) => {
    if ((element as HTMLInputElement).type === "hidden") {
      return false;
    }
    if ((element as HTMLInputElement).disabled) {
      return false;
    }
    return true;
  });

  const currentIndex = controls.indexOf(current);
  if (currentIndex < 0) {
    return;
  }

  const nextControl = controls[currentIndex + 1];
  if (nextControl) {
    nextControl.focus();
  }
}

function handleEnterAdvance(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }

  event.preventDefault();
  const current = event.currentTarget;
  current.blur();
  focusNextGridControl(current);
}

function getSaveStatusLabel(status: SaveStatus): string {
  if (status === "saving") {
    return "Αποθηκεύεται...";
  }
  if (status === "error") {
    return "Σφάλμα αποθήκευσης";
  }
  return "Αποθηκεύτηκε";
}

export function PaymentsGrid({ rows, saveStatusByClientId, onSave }: PaymentsGridProps) {
  const [drafts, setDrafts] = useState<Record<string, PaymentDraft>>({});
  const draftsRef = useRef<Record<string, PaymentDraft>>({});

  const sourceByClientId = useMemo(() => {
    return rows.reduce<Record<string, PaymentGridRow>>((acc, row) => {
      acc[row.client.id] = row;
      return acc;
    }, {});
  }, [rows]);

  useEffect(() => {
    const nextDrafts = rows.reduce<Record<string, PaymentDraft>>((acc, row) => {
      acc[row.client.id] = paymentToDraft(row.payment);
      return acc;
    }, {});
    setDrafts(nextDrafts);
    draftsRef.current = nextDrafts;
  }, [rows]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const updateDraft = (clientId: string, updater: (previous: PaymentDraft) => PaymentDraft) => {
    setDrafts((previous) => {
      const current = previous[clientId] ?? paymentToDraft(sourceByClientId[clientId]?.payment);
      const next = { ...previous, [clientId]: updater(current) };
      draftsRef.current = next;
      return next;
    });
  };

  const saveIfChanged = async (clientId: string, draft: PaymentDraft) => {
    const original = paymentToDraft(sourceByClientId[clientId]?.payment);
    if (draftsEqual(original, draft)) {
      return;
    }
    try {
      await onSave(clientId, draft);
    } catch {
      // Save errors are surfaced by status state and toast handlers.
    }
  };

  if (rows.length === 0) {
    return <p className="empty-state">Δεν βρέθηκαν πελάτες για τα τρέχοντα φίλτρα.</p>;
  }

  return (
    <div className="table-wrap payments-grid">
      <table className="table table-sticky">
        <thead>
          <tr>
            <th>Πελάτης</th>
            <th>Μαθήματα</th>
            <th>Τιμή</th>
            <th>Πληρωμένο</th>
            <th>Σημειώσεις</th>
            <th>Κατάσταση</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const clientId = row.client.id;
            const draft = drafts[clientId] ?? paymentToDraft(row.payment);
            const saveStatus = saveStatusByClientId[clientId] ?? "saved";

            return (
              <tr key={clientId}>
                <td>{row.client.full_name}</td>
                <td>
                  <input
                    className="input table-input"
                    type="number"
                    min={0}
                    step={1}
                    value={draft.lessons}
                    aria-label={`Μαθήματα για ${row.client.full_name}`}
                    onKeyDown={handleEnterAdvance}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateDraft(clientId, (previous) => ({ ...previous, lessons: value }));
                    }}
                    onBlur={() => void saveIfChanged(clientId, draftsRef.current[clientId] ?? draft)}
                  />
                </td>
                <td>
                  <input
                    className="input table-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.price}
                    aria-label={`Τιμή για ${row.client.full_name}`}
                    onKeyDown={handleEnterAdvance}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateDraft(clientId, (previous) => ({ ...previous, price: value }));
                    }}
                    onBlur={() => void saveIfChanged(clientId, draftsRef.current[clientId] ?? draft)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={draft.paid}
                    aria-label={`Πληρωμένο για ${row.client.full_name}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        focusNextGridControl(event.currentTarget);
                      }
                    }}
                    onChange={(event) => {
                      const nextDraft = { ...draft, paid: event.target.checked };
                      setDrafts((previous) => {
                        const next = { ...previous, [clientId]: nextDraft };
                        draftsRef.current = next;
                        return next;
                      });
                      void saveIfChanged(clientId, nextDraft);
                    }}
                  />
                </td>
                <td>
                  <textarea
                    className="input table-input"
                    rows={2}
                    value={draft.notes}
                    aria-label={`Σημειώσεις για ${row.client.full_name}`}
                    onKeyDown={handleEnterAdvance}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateDraft(clientId, (previous) => ({ ...previous, notes: value }));
                    }}
                    onBlur={() => void saveIfChanged(clientId, draftsRef.current[clientId] ?? draft)}
                  />
                </td>
                <td className={saveStatus === "error" ? "status-cell-error" : undefined}>
                  {getSaveStatusLabel(saveStatus)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
