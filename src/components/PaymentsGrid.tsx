import { useEffect, useMemo, useRef, useState } from "react";
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

type PaymentsGridProps = {
  rows: PaymentGridRow[];
  savingByClientId: Record<string, boolean>;
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

export function PaymentsGrid({ rows, savingByClientId, onSave }: PaymentsGridProps) {
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
    await onSave(clientId, draft);
  };

  if (rows.length === 0) {
    return <p className="empty-state">No active clients yet. Add your first client to start tracking payments.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Lessons</th>
            <th>Price</th>
            <th>Paid</th>
            <th>Notes</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const clientId = row.client.id;
            const draft = drafts[clientId] ?? paymentToDraft(row.payment);
            const isSaving = savingByClientId[clientId] ?? false;

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
                    onChange={(event) => {
                      const value = event.target.value;
                      updateDraft(clientId, (previous) => ({ ...previous, lessons: value }));
                    }}
                    onBlur={() =>
                      void saveIfChanged(clientId, draftsRef.current[clientId] ?? draft)
                    }
                  />
                </td>
                <td>
                  <input
                    className="input table-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.price}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateDraft(clientId, (previous) => ({ ...previous, price: value }));
                    }}
                    onBlur={() =>
                      void saveIfChanged(clientId, draftsRef.current[clientId] ?? draft)
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={draft.paid}
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
                    onChange={(event) => {
                      const value = event.target.value;
                      updateDraft(clientId, (previous) => ({ ...previous, notes: value }));
                    }}
                    onBlur={() =>
                      void saveIfChanged(clientId, draftsRef.current[clientId] ?? draft)
                    }
                  />
                </td>
                <td>{isSaving ? "Saving..." : "Saved"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
