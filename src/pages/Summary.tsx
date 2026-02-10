import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { fetchActiveClients, fetchAttendanceForMonth, fetchPaymentsForMonth } from "../lib/data";
import { addMonths, startOfMonth, toIsoDate } from "../lib/date";
import { formatCurrencyEUR } from "../lib/format";
import { MonthPicker } from "../components/MonthPicker";

type SummaryFilter = "all" | "pending" | "unpaid";

export function SummaryPage() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [activeFilter, setActiveFilter] = useState<SummaryFilter>("all");
  const monthStart = toIsoDate(startOfMonth(selectedMonth));
  const nextMonthStart = toIsoDate(addMonths(startOfMonth(selectedMonth), 1));

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

  const attendanceQuery = useQuery({
    queryKey: ["attendance", user?.id, monthStart, "attended"],
    enabled: Boolean(user?.id),
    queryFn: () => fetchAttendanceForMonth(user!.id, monthStart, nextMonthStart, "attended"),
  });

  const summaryRows = useMemo(() => {
    const clients = clientsQuery.data ?? [];
    const paymentByClientId = new Map((paymentsQuery.data ?? []).map((payment) => [payment.client_id, payment]));
    const attendedCountByClientId = new Map<string, number>();

    (attendanceQuery.data ?? []).forEach((session) => {
      attendedCountByClientId.set(session.client_id, (attendedCountByClientId.get(session.client_id) ?? 0) + 1);
    });

    return clients.map((client) => {
      const payment = paymentByClientId.get(client.id);
      const plannedLessons = payment?.lessons ?? 0;
      const attendedLessons = attendedCountByClientId.get(client.id) ?? 0;
      return {
        clientId: client.id,
        fullName: client.full_name,
        lessons: plannedLessons,
        attended: attendedLessons,
        pending: Math.max(0, plannedLessons - attendedLessons),
        price: payment?.price ?? 0,
        paid: payment?.paid ?? false,
      };
    });
  }, [attendanceQuery.data, clientsQuery.data, paymentsQuery.data]);

  const sortedRows = useMemo(() => {
    return [...summaryRows].sort((a, b) => {
      if (b.pending !== a.pending) {
        return b.pending - a.pending;
      }
      return a.fullName.localeCompare(b.fullName);
    });
  }, [summaryRows]);

  const filteredRows = useMemo(() => {
    if (activeFilter === "pending") {
      return sortedRows.filter((row) => row.pending > 0);
    }
    if (activeFilter === "unpaid") {
      return sortedRows.filter((row) => !row.paid);
    }
    return sortedRows;
  }, [activeFilter, sortedRows]);

  const totals = useMemo(() => {
    return summaryRows.reduce(
      (acc, row) => {
        acc.totalLessons += row.lessons;
        acc.totalAttended += row.attended;
        acc.totalPending += row.pending;
        acc.totalRevenue += row.price;
        if (row.paid) {
          acc.paidCount += 1;
        } else {
          acc.unpaidCount += 1;
        }
        return acc;
      },
      { totalLessons: 0, totalAttended: 0, totalPending: 0, totalRevenue: 0, paidCount: 0, unpaidCount: 0 },
    );
  }, [summaryRows]);

  if (clientsQuery.isLoading || paymentsQuery.isLoading || attendanceQuery.isLoading) {
    return <div className="status-box">Φόρτωση σύνοψης...</div>;
  }

  if (clientsQuery.isError || paymentsQuery.isError || attendanceQuery.isError) {
    const message =
      (clientsQuery.error instanceof Error && clientsQuery.error.message) ||
      (paymentsQuery.error instanceof Error && paymentsQuery.error.message) ||
      (attendanceQuery.error instanceof Error && attendanceQuery.error.message) ||
      "Δεν ήταν δυνατή η φόρτωση σύνοψης.";
    return <div className="status-box status-error">{message}</div>;
  }

  return (
    <section className="stack-md">
      <div className="row space-between align-end wrap">
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      <div className="summary-grid">
        <article className="summary-card summary-card-primary">
          <h3>Εκκρεμή μαθήματα</h3>
          <strong>{totals.totalPending}</strong>
        </article>
        <article className="summary-card">
          <h3>Παρακολουθήσεις</h3>
          <strong>{totals.totalAttended}</strong>
        </article>
        <article className="summary-card">
          <h3>Συνολικά μαθήματα</h3>
          <strong>{totals.totalLessons}</strong>
        </article>
        <article className="summary-card">
          <h3>Πληρωμένα / Απλήρωτα</h3>
          <strong>
            {totals.paidCount} / {totals.unpaidCount}
          </strong>
        </article>
        <article className="summary-card">
          <h3>Συνολικά έσοδα</h3>
          <strong>{formatCurrencyEUR(totals.totalRevenue)}</strong>
        </article>
      </div>

      <div className="row gap-sm wrap">
        <button
          type="button"
          className={activeFilter === "all" ? "button button-primary" : "button"}
          onClick={() => setActiveFilter("all")}
        >
          Όλοι
        </button>
        <button
          type="button"
          className={activeFilter === "pending" ? "button button-primary" : "button"}
          onClick={() => setActiveFilter("pending")}
        >
          Εκκρεμή &gt; 0
        </button>
        <button
          type="button"
          className={activeFilter === "unpaid" ? "button button-primary" : "button"}
          onClick={() => setActiveFilter("unpaid")}
        >
          Απλήρωτα
        </button>
      </div>

      <div className="table-wrap">
        <table className="table table-sticky">
          <thead>
            <tr>
              <th>Πελάτης</th>
              <th>Προγραμματισμένα</th>
              <th>Παρακολουθήσεις</th>
              <th>Εκκρεμή</th>
              <th>Τιμή</th>
              <th>Κατάσταση</th>
            </tr>
          </thead>
          {filteredRows.length ? (
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.clientId}>
                  <td>{row.fullName}</td>
                  <td>{row.lessons}</td>
                  <td>{row.attended}</td>
                  <td>{row.pending}</td>
                  <td>{formatCurrencyEUR(row.price)}</td>
                  <td>{row.paid ? "Πληρωμένο" : "Απλήρωτο"}</td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody>
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">Δεν βρέθηκαν εγγραφές για το επιλεγμένο φίλτρο.</div>
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </section>
  );
}
