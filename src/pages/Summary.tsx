import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { fetchActiveClients, fetchPaymentsForMonth } from "../lib/data";
import { startOfMonth, toIsoDate } from "../lib/date";
import { MonthPicker } from "../components/MonthPicker";

export function SummaryPage() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
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

  const summaryRows = useMemo(() => {
    const clients = clientsQuery.data ?? [];
    const paymentByClientId = new Map((paymentsQuery.data ?? []).map((payment) => [payment.client_id, payment]));

    return clients.map((client) => {
      const payment = paymentByClientId.get(client.id);
      return {
        clientId: client.id,
        fullName: client.full_name,
        lessons: payment?.lessons ?? 0,
        price: payment?.price ?? 0,
        paid: payment?.paid ?? false,
      };
    });
  }, [clientsQuery.data, paymentsQuery.data]);

  const totals = useMemo(() => {
    return summaryRows.reduce(
      (acc, row) => {
        acc.totalLessons += row.lessons;
        acc.totalRevenue += row.price;
        if (row.paid) {
          acc.paidCount += 1;
        } else {
          acc.unpaidCount += 1;
        }
        return acc;
      },
      { totalLessons: 0, totalRevenue: 0, paidCount: 0, unpaidCount: 0 },
    );
  }, [summaryRows]);

  if (clientsQuery.isLoading || paymentsQuery.isLoading) {
    return <div className="status-box">Loading summary...</div>;
  }

  if (clientsQuery.isError || paymentsQuery.isError) {
    const message =
      (clientsQuery.error instanceof Error && clientsQuery.error.message) ||
      (paymentsQuery.error instanceof Error && paymentsQuery.error.message) ||
      "Unable to load summary.";
    return <div className="status-box status-error">{message}</div>;
  }

  return (
    <section className="stack-md">
      <div className="row space-between align-end wrap">
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      <div className="summary-grid">
        <article className="summary-card">
          <h3>Total lessons</h3>
          <strong>{totals.totalLessons}</strong>
        </article>
        <article className="summary-card">
          <h3>Total revenue</h3>
          <strong>${totals.totalRevenue.toFixed(2)}</strong>
        </article>
        <article className="summary-card">
          <h3>Paid</h3>
          <strong>{totals.paidCount}</strong>
        </article>
        <article className="summary-card">
          <h3>Unpaid</h3>
          <strong>{totals.unpaidCount}</strong>
        </article>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Lessons</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => (
              <tr key={row.clientId}>
                <td>{row.fullName}</td>
                <td>{row.lessons}</td>
                <td>${row.price.toFixed(2)}</td>
                <td>{row.paid ? "Paid" : "Unpaid"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

