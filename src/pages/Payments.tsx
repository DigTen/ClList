import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { addClient, fetchActiveClients, fetchPaymentsForMonth, upsertPayment } from "../lib/data";
import { startOfMonth, toIsoDate } from "../lib/date";
import { MonthPicker } from "../components/MonthPicker";
import { AddClientDialog } from "../components/AddClientDialog";
import { PaymentDraft, PaymentsGrid } from "../components/PaymentsGrid";
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
  const [savingByClientId, setSavingByClientId] = useState<Record<string, boolean>>({});
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
      toast.success("Client added.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not add client.";
      toast.error(message);
    },
  });

  const paymentMutation = useMutation({
    mutationFn: upsertPayment,
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not save payment.";
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

  const handleAddClient = async (input: { fullName: string; phone: string | null }) => {
    await addClientMutation.mutateAsync(input);
  };

  const handleSavePayment = async (clientId: string, draft: PaymentDraft) => {
    if (!user) {
      return;
    }

    setSavingByClientId((previous) => ({ ...previous, [clientId]: true }));
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
    } finally {
      setSavingByClientId((previous) => ({ ...previous, [clientId]: false }));
    }
  };

  if (clientsQuery.isLoading || paymentsQuery.isLoading) {
    return <div className="status-box">Loading payments...</div>;
  }

  if (clientsQuery.isError || paymentsQuery.isError) {
    const message =
      (clientsQuery.error instanceof Error && clientsQuery.error.message) ||
      (paymentsQuery.error instanceof Error && paymentsQuery.error.message) ||
      "Unable to load data.";
    return <div className="status-box status-error">{message}</div>;
  }

  return (
    <section className="stack-md">
      <div className="row space-between align-end wrap">
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
        <AddClientDialog onAddClient={handleAddClient} />
      </div>

      <PaymentsGrid rows={rows} savingByClientId={savingByClientId} onSave={handleSavePayment} />
    </section>
  );
}

