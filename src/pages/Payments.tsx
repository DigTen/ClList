import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { addClient, fetchActiveClients, fetchPaymentsForMonth, upsertPayment } from "../lib/data";
import { addMonths, startOfMonth, toIsoDate } from "../lib/date";
import { formatCurrencyEUR } from "../lib/format";
import { MonthPicker } from "../components/MonthPicker";
import { AddClientDialog } from "../components/AddClientDialog";
import { PaymentDraft, PaymentsGrid, SaveStatus } from "../components/PaymentsGrid";
import type { Client, Payment } from "../types/database";
import { toast } from "sonner";

type PaymentsFilter = "all" | "unpaid" | "paid" | "no_record";

function parseLessons(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePrice(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPaymentPriority(payment?: Payment): number {
  if (!payment) {
    return 1;
  }
  if (!payment.paid) {
    return 0;
  }
  return 2;
}

export function PaymentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [clientSearch, setClientSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<PaymentsFilter>("all");
  const [isCopyPanelOpen, setIsCopyPanelOpen] = useState(false);
  const [isCopyingPreviousMonth, setIsCopyingPreviousMonth] = useState(false);
  const [savingCountByClientId, setSavingCountByClientId] = useState<Record<string, number>>({});
  const [saveErrorByClientId, setSaveErrorByClientId] = useState<Record<string, boolean>>({});
  const saveQueueByClientIdRef = useRef<Record<string, Promise<void>>>({});

  const monthStart = toIsoDate(startOfMonth(selectedMonth));
  const previousMonthDate = addMonths(selectedMonth, -1);
  const previousMonthStart = toIsoDate(startOfMonth(previousMonthDate));
  const previousMonthLabel = new Intl.DateTimeFormat("el-GR", {
    month: "long",
    year: "numeric",
  }).format(previousMonthDate);

  const clientsQuery = useQuery({
    queryKey: ["clients", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchActiveClients(user!.id),
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments", user?.id, monthStart],
    enabled: Boolean(user?.id),
    queryFn: () => fetchPaymentsForMonth(user!.id, monthStart),
  });

  const previousPaymentsQuery = useQuery({
    queryKey: ["payments", user?.id, previousMonthStart],
    enabled: Boolean(user?.id),
    queryFn: () => fetchPaymentsForMonth(user!.id, previousMonthStart),
  });

  const addClientMutation = useMutation({
    mutationFn: async (input: { fullName: string; phone: string | null }) =>
      addClient({
        full_name: input.fullName,
        phone: input.phone,
        user_id: user!.id,
      }),
    onSuccess: (createdClient) => {
      queryClient.setQueryData<Client[]>(["clients", user?.id], (current = []) => {
        return [...current, createdClient].sort((a, b) => a.full_name.localeCompare(b.full_name));
      });
      toast.success("Ο πελάτης προστέθηκε.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η προσθήκη πελάτη.";
      toast.error(message);
    },
  });

  const paymentMutation = useMutation({
    mutationFn: upsertPayment,
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η αποθήκευση πληρωμής.";
      toast.error(message);
    },
  });

  const rows = useMemo(() => {
    const clients = clientsQuery.data ?? [];
    const paymentByClientId = new Map((paymentsQuery.data ?? []).map((payment) => [payment.client_id, payment]));
    return clients.map((client) => ({
      client,
      payment: paymentByClientId.get(client.id),
    }));
  }, [clientsQuery.data, paymentsQuery.data]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const priorityA = getPaymentPriority(a.payment);
      const priorityB = getPaymentPriority(b.payment);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.client.full_name.localeCompare(b.client.full_name);
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalized = clientSearch.trim().toLowerCase();

    return sortedRows.filter((row) => {
      if (activeFilter === "unpaid" && (!row.payment || row.payment.paid)) {
        return false;
      }
      if (activeFilter === "paid" && (!row.payment || !row.payment.paid)) {
        return false;
      }
      if (activeFilter === "no_record" && row.payment) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      const name = row.client.full_name.toLowerCase();
      const phone = row.client.phone?.toLowerCase() ?? "";
      return name.includes(normalized) || phone.includes(normalized);
    });
  }, [activeFilter, clientSearch, sortedRows]);

  const paymentsOverview = useMemo(() => {
    const totalClients = rows.length;
    const unpaidRows = rows.filter((row) => row.payment && !row.payment.paid);
    const paidRows = rows.filter((row) => row.payment?.paid);
    const noRecordRows = rows.filter((row) => !row.payment);

    const totalAmount = rows.reduce((sum, row) => sum + (row.payment?.price ?? 0), 0);
    const unpaidAmount = unpaidRows.reduce((sum, row) => sum + (row.payment?.price ?? 0), 0);

    return {
      totalClients,
      unpaidCount: unpaidRows.length,
      paidCount: paidRows.length,
      noRecordCount: noRecordRows.length,
      totalAmount,
      unpaidAmount,
    };
  }, [rows]);

  const previousPaymentByClientId = useMemo(() => {
    return new Map((previousPaymentsQuery.data ?? []).map((payment) => [payment.client_id, payment]));
  }, [previousPaymentsQuery.data]);

  const copyCandidates = useMemo(() => {
    return rows
      .map((row) => {
        const previousPayment = previousPaymentByClientId.get(row.client.id);
        if (!previousPayment) {
          return null;
        }

        const nextLessons = previousPayment.lessons != null ? String(previousPayment.lessons) : "";
        const nextPrice = previousPayment.price != null ? String(previousPayment.price) : "";
        const currentLessons = row.payment?.lessons != null ? String(row.payment.lessons) : "";
        const currentPrice = row.payment?.price != null ? String(row.payment.price) : "";

        if (nextLessons === currentLessons && nextPrice === currentPrice) {
          return null;
        }

        return {
          clientId: row.client.id,
          draft: {
            lessons: nextLessons,
            price: nextPrice,
            paid: row.payment?.paid ?? false,
            notes: row.payment?.notes ?? "",
          } satisfies PaymentDraft,
        };
      })
      .filter((candidate): candidate is { clientId: string; draft: PaymentDraft } => Boolean(candidate));
  }, [previousPaymentByClientId, rows]);

  const handleAddClient = async (input: { fullName: string; phone: string | null }) => {
    await addClientMutation.mutateAsync(input);
  };

  const updateSavingCount = (clientId: string, delta: 1 | -1) => {
    setSavingCountByClientId((previous) => {
      const current = previous[clientId] ?? 0;
      const nextCount = Math.max(0, current + delta);

      if (nextCount === 0) {
        if (!(clientId in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[clientId];
        return next;
      }

      return { ...previous, [clientId]: nextCount };
    });
  };

  const markSaveError = (clientId: string, hasError: boolean) => {
    setSaveErrorByClientId((previous) => {
      if (hasError) {
        if (previous[clientId]) {
          return previous;
        }
        return { ...previous, [clientId]: true };
      }

      if (!(clientId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[clientId];
      return next;
    });
  };

  const savePayment = async (clientId: string, draft: PaymentDraft) => {
    if (!user) {
      return;
    }

    updateSavingCount(clientId, 1);
    try {
      const savedPayment = await paymentMutation.mutateAsync({
        user_id: user.id,
        client_id: clientId,
        month_start: monthStart,
        lessons: parseLessons(draft.lessons),
        price: parsePrice(draft.price),
        paid: draft.paid,
        notes: draft.notes.trim() ? draft.notes.trim() : null,
      });

      queryClient.setQueryData<Payment[]>(["payments", user.id, monthStart], (current = []) => {
        const existingIndex = current.findIndex((payment) => payment.client_id === savedPayment.client_id);
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = savedPayment;
          return next;
        }
        return [...current, savedPayment];
      });

      markSaveError(clientId, false);
    } catch {
      markSaveError(clientId, true);
      throw new Error("save_failed");
    } finally {
      updateSavingCount(clientId, -1);
    }
  };

  const handleSavePayment = (clientId: string, draft: PaymentDraft) => {
    const previousSave = saveQueueByClientIdRef.current[clientId] ?? Promise.resolve();
    const nextSave = previousSave
      .catch(() => {
        // Keep queue alive after a failed save.
      })
      .then(() => savePayment(clientId, draft));

    saveQueueByClientIdRef.current[clientId] = nextSave.finally(() => {
      if (saveQueueByClientIdRef.current[clientId] === nextSave) {
        delete saveQueueByClientIdRef.current[clientId];
      }
    });

    return nextSave;
  };

  const handleCopyPreviousMonth = async () => {
    if (!user || copyCandidates.length === 0) {
      return;
    }

    setIsCopyingPreviousMonth(true);
    let copiedCount = 0;
    let failedCount = 0;

    for (const candidate of copyCandidates) {
      try {
        await handleSavePayment(candidate.clientId, candidate.draft);
        copiedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    setIsCopyingPreviousMonth(false);
    setIsCopyPanelOpen(false);

    if (copiedCount > 0) {
      toast.success(`Αντιγράφηκαν Μαθήματα/Τιμή από ${previousMonthLabel} σε ${copiedCount} πελάτες.`);
    }

    if (failedCount > 0) {
      toast.error(`Απέτυχε η αντιγραφή για ${failedCount} πελάτες.`);
    }
  };

  useEffect(() => {
    setIsCopyPanelOpen(false);
    setIsCopyingPreviousMonth(false);
  }, [monthStart]);

  const saveStatusByClientId = useMemo<Record<string, SaveStatus>>(() => {
    return rows.reduce<Record<string, SaveStatus>>((acc, row) => {
      const clientId = row.client.id;
      const isSaving = (savingCountByClientId[clientId] ?? 0) > 0;
      const hasError = saveErrorByClientId[clientId] ?? false;

      if (isSaving) {
        acc[clientId] = "saving";
      } else if (hasError) {
        acc[clientId] = "error";
      } else {
        acc[clientId] = "saved";
      }

      return acc;
    }, {});
  }, [rows, saveErrorByClientId, savingCountByClientId]);

  const emptyMessage =
    clientSearch.trim() || activeFilter !== "all"
      ? "Δεν βρέθηκαν πελάτες για τα τρέχοντα φίλτρα/αναζήτηση."
      : "Δεν υπάρχουν πελάτες για εμφάνιση.";

  if (clientsQuery.isLoading || paymentsQuery.isLoading) {
    return <div className="status-box">Φόρτωση πληρωμών...</div>;
  }

  if (clientsQuery.isError || paymentsQuery.isError) {
    const message =
      (clientsQuery.error instanceof Error && clientsQuery.error.message) ||
      (paymentsQuery.error instanceof Error && paymentsQuery.error.message) ||
      "Δεν ήταν δυνατή η φόρτωση δεδομένων.";
    return <div className="status-box status-error">{message}</div>;
  }

  return (
    <section className="stack-md">
      <div className="row space-between align-end wrap">
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
        <AddClientDialog onAddClient={handleAddClient} />
      </div>

      <div className="card payments-bulk-copy">
        <div className="payments-bulk-copy-summary">
          <strong>Αντιγραφή προηγούμενου μήνα</strong>
          <span className="muted-text">
            Αντιγράφει μόνο τα πεδία <b>Μαθήματα</b> και <b>Τιμή</b> από τον {previousMonthLabel}.
          </span>
          <span className="muted-text">
            Θα ενημερωθούν {copyCandidates.length} πελάτες. Υπάρχουν {(previousPaymentsQuery.data ?? []).length} εγγραφές
            στον προηγούμενο μήνα.
          </span>
        </div>
        <div className="payments-bulk-copy-actions">
          {!isCopyPanelOpen ? (
            <button
              type="button"
              className="button"
              disabled={
                isCopyingPreviousMonth || previousPaymentsQuery.isLoading || previousPaymentsQuery.isError || copyCandidates.length === 0
              }
              onClick={() => setIsCopyPanelOpen(true)}
            >
              Αντιγραφή προηγούμενου μήνα
            </button>
          ) : (
            <>
              <p className="muted-text payments-bulk-copy-warning">
                Επιβεβαίωσε για να εφαρμοστεί η αντιγραφή. Αυτό το διπλό βήμα μειώνει τα λάθος κλικ.
              </p>
              <div className="row gap-sm">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={isCopyingPreviousMonth || copyCandidates.length === 0}
                  onClick={() => void handleCopyPreviousMonth()}
                >
                  {isCopyingPreviousMonth ? "Αντιγραφή..." : "Επιβεβαίωση αντιγραφής"}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={isCopyingPreviousMonth}
                  onClick={() => setIsCopyPanelOpen(false)}
                >
                  Ακύρωση
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="payments-kpi-grid">
        <article className="card payments-kpi-card">
          <span className="muted-text">Σύνολο πελατών</span>
          <strong>{paymentsOverview.totalClients}</strong>
        </article>
        <article className="card payments-kpi-card payments-kpi-card-unpaid">
          <span className="muted-text">Απλήρωτοι</span>
          <strong>{paymentsOverview.unpaidCount}</strong>
        </article>
        <article className="card payments-kpi-card">
          <span className="muted-text">Εξοφλημένοι</span>
          <strong>{paymentsOverview.paidCount}</strong>
        </article>
        <article className="card payments-kpi-card">
          <span className="muted-text">Σύνολο ποσού μήνα (€)</span>
          <strong>{formatCurrencyEUR(paymentsOverview.totalAmount)}</strong>
        </article>
        <article className="card payments-kpi-card payments-kpi-card-unpaid">
          <span className="muted-text">Απλήρωτο ποσό (€)</span>
          <strong>{formatCurrencyEUR(paymentsOverview.unpaidAmount)}</strong>
        </article>
      </div>

      <div className="payments-filter-toolbar">
        <label className="field-label payments-search-field">
          <span>Αναζήτηση πελάτη</span>
          <input
            className="input"
            type="search"
            value={clientSearch}
            onChange={(event) => setClientSearch(event.target.value)}
            placeholder="Όνομα ή τηλέφωνο..."
          />
        </label>

        <div className="payments-filter-buttons">
          <button
            type="button"
            className={activeFilter === "all" ? "button button-primary" : "button"}
            onClick={() => setActiveFilter("all")}
          >
            Όλοι ({paymentsOverview.totalClients})
          </button>
          <button
            type="button"
            className={activeFilter === "unpaid" ? "button button-primary" : "button"}
            onClick={() => setActiveFilter("unpaid")}
          >
            Απλήρωτοι ({paymentsOverview.unpaidCount})
          </button>
          <button
            type="button"
            className={activeFilter === "paid" ? "button button-primary" : "button"}
            onClick={() => setActiveFilter("paid")}
          >
            Εξοφλημένοι ({paymentsOverview.paidCount})
          </button>
          <button
            type="button"
            className={activeFilter === "no_record" ? "button button-primary" : "button"}
            onClick={() => setActiveFilter("no_record")}
          >
            Χωρίς εγγραφή πληρωμής ({paymentsOverview.noRecordCount})
          </button>
        </div>
      </div>

      <PaymentsGrid
        rows={filteredRows}
        saveStatusByClientId={saveStatusByClientId}
        onSave={handleSavePayment}
        emptyMessage={emptyMessage}
      />
    </section>
  );
}
