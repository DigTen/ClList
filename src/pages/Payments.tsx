import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { addClient, fetchActiveClients, fetchPaymentsForMonth, upsertPayment } from "../lib/data";
import { startOfMonth, toIsoDate } from "../lib/date";
import { MonthPicker } from "../components/MonthPicker";
import { AddClientDialog } from "../components/AddClientDialog";
import { PaymentDraft, PaymentsGrid, SaveStatus } from "../components/PaymentsGrid";
import type { Client, Payment } from "../types/database";
import { toast } from "sonner";

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

export function PaymentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [clientSearch, setClientSearch] = useState("");
  const [savingCountByClientId, setSavingCountByClientId] = useState<Record<string, number>>({});
  const [saveErrorByClientId, setSaveErrorByClientId] = useState<Record<string, boolean>>({});
  const saveQueueByClientIdRef = useRef<Record<string, Promise<void>>>({});
  const monthStart = toIsoDate(startOfMonth(selectedMonth));

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

  const filteredRows = useMemo(() => {
    const normalized = clientSearch.trim().toLowerCase();
    if (!normalized) {
      return rows;
    }

    return rows.filter((row) => {
      const name = row.client.full_name.toLowerCase();
      const phone = row.client.phone?.toLowerCase() ?? "";
      return name.includes(normalized) || phone.includes(normalized);
    });
  }, [clientSearch, rows]);

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

      <label className="field-label">
        <span>Αναζήτηση πελάτη</span>
        <input
          className="input"
          type="search"
          value={clientSearch}
          onChange={(event) => setClientSearch(event.target.value)}
          placeholder="Όνομα ή τηλέφωνο..."
        />
      </label>

      <PaymentsGrid rows={filteredRows} saveStatusByClientId={saveStatusByClientId} onSave={handleSavePayment} />
    </section>
  );
}
