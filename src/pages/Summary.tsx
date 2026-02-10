import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import {
  fetchAttendanceForMonth,
  fetchClients,
  fetchFollowUpTasks,
  fetchPaymentsForMonth,
  refreshManagementSignals,
} from "../lib/data";
import { addDays, addMonths, startOfMonth, toIsoDate } from "../lib/date";
import { formatCurrencyEUR } from "../lib/format";
import { MonthPicker } from "../components/MonthPicker";

type ClientControlFilter = "all" | "overused" | "pending" | "unpaid" | "no_package";

type AdvancedSignalRow = {
  clientId: string;
  fullName: string;
  riskScore: number;
  reasons: string[];
  pendingLessons: number;
  noShow28: number;
  openTasks: number;
  streakBreak: boolean;
};

type ClientMonthControlRow = {
  clientId: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  plannedLessons: number;
  attendedLessons: number;
  delta: number;
  pending: number;
  isOverused: boolean;
  hasPaymentRow: boolean;
  paid: boolean | null;
  price: number | null;
};

function calculateRiskScore(input: {
  noShow28: number;
  attendedRecent28: number;
  attendedPrevious28: number;
  pendingLessons: number;
  isPaid: boolean;
  openTasks: number;
}) {
  let score = 0;
  const reasons: string[] = [];

  if (input.noShow28 >= 2) {
    score += 50 + Math.min(30, (input.noShow28 - 2) * 10);
    reasons.push("Επαναλαμβανόμενες μη προσελεύσεις");
  }

  if (input.attendedPrevious28 > 0 && input.attendedRecent28 <= Math.floor(input.attendedPrevious28 * 0.5)) {
    score += 25;
    reasons.push("Πτώση προσέλευσης");
  }

  if (!input.isPaid && input.pendingLessons >= 4) {
    score += 20;
    reasons.push("Απλήρωτα με εκκρεμότητα");
  }

  if (input.attendedPrevious28 > 0 && input.attendedRecent28 === 0) {
    score += 15;
    reasons.push("Διακοπή ροής μαθημάτων");
  }

  if (input.openTasks > 0) {
    score += 10;
    reasons.push("Εκκρεμείς εργασίες");
  }

  return {
    score: Math.min(100, score),
    reasons,
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function matchesClientControlFilter(row: ClientMonthControlRow, filter: ClientControlFilter): boolean {
  if (filter === "overused") {
    return row.isOverused;
  }
  if (filter === "pending") {
    return row.pending > 0;
  }
  if (filter === "unpaid") {
    return row.hasPaymentRow && row.paid === false;
  }
  if (filter === "no_package") {
    return !row.hasPaymentRow && row.attendedLessons > 0;
  }
  return true;
}

export function SummaryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const [clientControlFilter, setClientControlFilter] = useState<ClientControlFilter>("all");
  const [clientSearch, setClientSearch] = useState("");

  const now = new Date();
  const todayIso = toIsoDate(now);
  const tomorrowIso = toIsoDate(addDays(now, 1));
  const monthStart = toIsoDate(startOfMonth(selectedMonth));
  const nextMonthStart = toIsoDate(addMonths(startOfMonth(selectedMonth), 1));
  const recent28Start = toIsoDate(addDays(now, -27));
  const previous56Start = toIsoDate(addDays(now, -55));

  const clientsQuery = useQuery({
    queryKey: ["clients-all", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchClients(user!.id),
  });

  const attendanceMonthQuery = useQuery({
    queryKey: ["attendance", user?.id, monthStart, nextMonthStart, "month-hub"],
    enabled: Boolean(user?.id),
    queryFn: () => fetchAttendanceForMonth(user!.id, monthStart, nextMonthStart),
  });

  const attendanceRollingQuery = useQuery({
    queryKey: ["attendance", user?.id, previous56Start, tomorrowIso, "rolling-hub"],
    enabled: Boolean(user?.id),
    queryFn: () => fetchAttendanceForMonth(user!.id, previous56Start, tomorrowIso),
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments", user?.id, monthStart],
    enabled: Boolean(user?.id),
    queryFn: () => fetchPaymentsForMonth(user!.id, monthStart),
  });

  const tasksQuery = useQuery({
    queryKey: ["follow-up-tasks", user?.id, "open"],
    enabled: Boolean(user?.id),
    queryFn: () => fetchFollowUpTasks(user!.id, ["open", "in_progress"]),
  });

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void refreshManagementSignals()
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["follow-up-tasks", user.id] });
        queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
      })
      .catch(() => {
        // Keep summary usable even if background refresh fails.
      });
  }, [queryClient, user?.id]);

  const clientMonthControlRows = useMemo<ClientMonthControlRow[]>(() => {
    const attendedByClient = new Map<string, number>();
    (attendanceMonthQuery.data ?? []).forEach((session) => {
      if (session.status !== "attended") {
        return;
      }
      attendedByClient.set(session.client_id, (attendedByClient.get(session.client_id) ?? 0) + 1);
    });

    const paymentByClient = new Map((paymentsQuery.data ?? []).map((payment) => [payment.client_id, payment]));

    return (clientsQuery.data ?? [])
      .map((client) => {
        const payment = paymentByClient.get(client.id);
        const plannedLessons = Math.max(0, payment?.lessons ?? 0);
        const attendedLessons = attendedByClient.get(client.id) ?? 0;
        const pending = Math.max(0, plannedLessons - attendedLessons);
        const delta = attendedLessons - plannedLessons;
        return {
          clientId: client.id,
          fullName: client.full_name,
          phone: client.phone,
          isActive: client.is_active,
          plannedLessons,
          attendedLessons,
          delta,
          pending,
          isOverused: delta > 0,
          hasPaymentRow: Boolean(payment),
          paid: payment?.paid ?? null,
          price: payment?.price ?? null,
        };
      })
      .sort((a, b) => {
        if (b.delta !== a.delta) {
          return b.delta - a.delta;
        }
        return a.fullName.localeCompare(b.fullName);
      });
  }, [attendanceMonthQuery.data, clientsQuery.data, paymentsQuery.data]);

  const clientControlCounts = useMemo(() => {
    return {
      all: clientMonthControlRows.length,
      overused: clientMonthControlRows.filter((row) => row.isOverused).length,
      pending: clientMonthControlRows.filter((row) => row.pending > 0).length,
      unpaid: clientMonthControlRows.filter((row) => row.hasPaymentRow && row.paid === false).length,
      no_package: clientMonthControlRows.filter((row) => !row.hasPaymentRow && row.attendedLessons > 0).length,
    };
  }, [clientMonthControlRows]);

  const filteredClientControlRows = useMemo(() => {
    const normalizedSearch = clientSearch.trim().toLowerCase();
    return clientMonthControlRows.filter((row) => {
      if (!matchesClientControlFilter(row, clientControlFilter)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const haystack = `${row.fullName} ${row.phone ?? ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [clientControlFilter, clientMonthControlRows, clientSearch]);

  const advancedSignals = useMemo<AdvancedSignalRow[]>(() => {
    const clients = (clientsQuery.data ?? []).filter((client) => client.is_active);
    const paymentsByClient = new Map((paymentsQuery.data ?? []).map((payment) => [payment.client_id, payment]));

    const openTasksByClient = new Map<string, number>();
    (tasksQuery.data ?? []).forEach((task) => {
      openTasksByClient.set(task.client_id, (openTasksByClient.get(task.client_id) ?? 0) + 1);
    });

    const attendedMonthByClient = new Map<string, number>();
    (attendanceMonthQuery.data ?? []).forEach((session) => {
      if (session.status !== "attended") {
        return;
      }
      attendedMonthByClient.set(session.client_id, (attendedMonthByClient.get(session.client_id) ?? 0) + 1);
    });

    const noShow28ByClient = new Map<string, number>();
    const attendedRecent28ByClient = new Map<string, number>();
    const attendedPrevious28ByClient = new Map<string, number>();

    (attendanceRollingQuery.data ?? []).forEach((session) => {
      if (session.session_date >= recent28Start) {
        if (session.status === "no_show") {
          noShow28ByClient.set(session.client_id, (noShow28ByClient.get(session.client_id) ?? 0) + 1);
        }
        if (session.status === "attended") {
          attendedRecent28ByClient.set(session.client_id, (attendedRecent28ByClient.get(session.client_id) ?? 0) + 1);
        }
      } else if (session.status === "attended") {
        attendedPrevious28ByClient.set(session.client_id, (attendedPrevious28ByClient.get(session.client_id) ?? 0) + 1);
      }
    });

    return clients
      .map((client) => {
        const payment = paymentsByClient.get(client.id);
        const plannedLessons = payment?.lessons ?? 0;
        const attendedLessons = attendedMonthByClient.get(client.id) ?? 0;
        const pendingLessons = Math.max(0, plannedLessons - attendedLessons);
        const noShow28 = noShow28ByClient.get(client.id) ?? 0;
        const attendedRecent28 = attendedRecent28ByClient.get(client.id) ?? 0;
        const attendedPrevious28 = attendedPrevious28ByClient.get(client.id) ?? 0;
        const openTasks = openTasksByClient.get(client.id) ?? 0;
        const streakBreak = attendedPrevious28 > 0 && attendedRecent28 === 0;

        const { score, reasons } = calculateRiskScore({
          noShow28,
          attendedRecent28,
          attendedPrevious28,
          pendingLessons,
          isPaid: payment?.paid ?? false,
          openTasks,
        });

        return {
          clientId: client.id,
          fullName: client.full_name,
          riskScore: score,
          reasons,
          pendingLessons,
          noShow28,
          openTasks,
          streakBreak,
        };
      })
      .filter((row) => row.riskScore > 0)
      .sort((a, b) => {
        if (b.riskScore !== a.riskScore) {
          return b.riskScore - a.riskScore;
        }
        if (b.pendingLessons !== a.pendingLessons) {
          return b.pendingLessons - a.pendingLessons;
        }
        return a.fullName.localeCompare(b.fullName);
      });
  }, [
    attendanceMonthQuery.data,
    attendanceRollingQuery.data,
    clientsQuery.data,
    paymentsQuery.data,
    recent28Start,
    tasksQuery.data,
  ]);

  const advancedOverview = useMemo(() => {
    const rollingRecent = (attendanceRollingQuery.data ?? []).filter((session) => session.session_date >= recent28Start);
    const noShowCount = rollingRecent.filter((session) => session.status === "no_show").length;
    const noShowRatio = rollingRecent.length ? noShowCount / rollingRecent.length : 0;

    const overdueTasks = (tasksQuery.data ?? []).filter((task) => task.due_date < todayIso).length;
    const openTasks = (tasksQuery.data ?? []).length;

    const unpaidPayments = (paymentsQuery.data ?? []).filter((payment) => !payment.paid);
    const unpaidClients = unpaidPayments.length;
    const unpaidAmount = unpaidPayments.reduce((sum, payment) => sum + (payment.price ?? 0), 0);

    const streakBreaks = advancedSignals.filter((row) => row.streakBreak).length;
    const highRiskClients = advancedSignals.filter((row) => row.riskScore >= 70).length;

    return {
      noShowRatio,
      overdueTasks,
      openTasks,
      unpaidClients,
      unpaidAmount,
      streakBreaks,
      highRiskClients,
    };
  }, [advancedSignals, attendanceRollingQuery.data, paymentsQuery.data, recent28Start, tasksQuery.data, todayIso]);

  if (
    clientsQuery.isLoading ||
    attendanceMonthQuery.isLoading ||
    attendanceRollingQuery.isLoading ||
    paymentsQuery.isLoading ||
    tasksQuery.isLoading
  ) {
    return <div className="status-box">Φόρτωση σύνοψης...</div>;
  }

  if (
    clientsQuery.isError ||
    attendanceMonthQuery.isError ||
    attendanceRollingQuery.isError ||
    paymentsQuery.isError ||
    tasksQuery.isError
  ) {
    const message =
      (clientsQuery.error instanceof Error && clientsQuery.error.message) ||
      (attendanceMonthQuery.error instanceof Error && attendanceMonthQuery.error.message) ||
      (attendanceRollingQuery.error instanceof Error && attendanceRollingQuery.error.message) ||
      (paymentsQuery.error instanceof Error && paymentsQuery.error.message) ||
      (tasksQuery.error instanceof Error && tasksQuery.error.message) ||
      "Δεν ήταν δυνατή η φόρτωση της σύνοψης.";
    return <div className="status-box status-error">{message}</div>;
  }

  return (
    <section className="stack-md">
      <div className="row space-between align-end wrap gap-sm">
        <MonthPicker label="Μήνας αναφοράς" value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      <article className="card stack-sm">
        <h3>Έλεγχος πελατών μήνα</h3>
        <div className="client-control-toolbar">
          <label className="field-label client-control-search">
            <span>Αναζήτηση πελάτη</span>
            <input
              className="input"
              type="search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              placeholder="Όνομα ή τηλέφωνο..."
            />
          </label>

          <div className="client-control-filters">
            <button
              type="button"
              className={clientControlFilter === "all" ? "button button-primary" : "button"}
              onClick={() => setClientControlFilter("all")}
            >
              Όλοι ({clientControlCounts.all})
            </button>
            <button
              type="button"
              className={clientControlFilter === "overused" ? "button button-primary" : "button"}
              onClick={() => setClientControlFilter("overused")}
            >
              Υπέρβαση ({clientControlCounts.overused})
            </button>
            <button
              type="button"
              className={clientControlFilter === "pending" ? "button button-primary" : "button"}
              onClick={() => setClientControlFilter("pending")}
            >
              Εκκρεμή ({clientControlCounts.pending})
            </button>
            <button
              type="button"
              className={clientControlFilter === "unpaid" ? "button button-primary" : "button"}
              onClick={() => setClientControlFilter("unpaid")}
            >
              Απλήρωτοι ({clientControlCounts.unpaid})
            </button>
            <button
              type="button"
              className={clientControlFilter === "no_package" ? "button button-primary" : "button"}
              onClick={() => setClientControlFilter("no_package")}
            >
              Χωρίς πακέτο ({clientControlCounts.no_package})
            </button>
          </div>
        </div>

        {filteredClientControlRows.length ? (
          <div className="table-wrap">
            <table className="table table-sticky">
              <thead>
                <tr>
                  <th>Πελάτης</th>
                  <th>Μαθήματα πακέτου</th>
                  <th>Παρακολουθήσεις</th>
                  <th>Διαφορά</th>
                  <th>Εκκρεμή</th>
                  <th>Πληρωμή</th>
                  <th>Ενέργεια</th>
                </tr>
              </thead>
              <tbody>
                {filteredClientControlRows.map((row) => (
                  <tr
                    key={row.clientId}
                    className={[
                      "client-control-row",
                      row.isOverused ? "client-control-row-overused" : "",
                      row.hasPaymentRow && row.paid === false ? "client-control-row-unpaid" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td>
                      <div className="row gap-sm align-center wrap">
                        <Link to={`/clients/${row.clientId}`}>{row.fullName}</Link>
                        {!row.isActive ? <span className="client-control-badge client-control-badge-muted">Ανενεργός</span> : null}
                        {row.isOverused ? (
                          <span className="client-control-badge client-control-badge-overused">Υπέρβαση +{row.delta}</span>
                        ) : null}
                      </div>
                      {row.phone ? <div className="muted-text">{row.phone}</div> : null}
                    </td>
                    <td>{row.plannedLessons}</td>
                    <td>{row.attendedLessons}</td>
                    <td className={row.delta > 0 ? "client-control-delta-over" : undefined}>
                      {row.delta > 0 ? `+${row.delta}` : row.delta}
                    </td>
                    <td>{row.pending}</td>
                    <td>
                      {!row.hasPaymentRow ? (
                        <span className="client-control-badge client-control-badge-muted">Χωρίς πακέτο</span>
                      ) : row.paid ? (
                        <span className="client-control-badge client-control-badge-paid">Πληρωμένο</span>
                      ) : (
                        <span className="client-control-badge client-control-badge-unpaid">Απλήρωτο</span>
                      )}
                      {row.price != null ? <div className="muted-text">{formatCurrencyEUR(row.price)}</div> : null}
                    </td>
                    <td>
                      <Link className="button" to={`/clients/${row.clientId}`}>
                        Άνοιγμα προφίλ
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Δεν βρέθηκαν πελάτες για τα επιλεγμένα φίλτρα.</div>
        )}
      </article>

      <article className="card stack-sm">
        <div className="row space-between align-center wrap gap-sm">
          <h3>Προχωρημένοι δείκτες</h3>
          <button
            type="button"
            className="button"
            aria-expanded={showAdvancedMetrics}
            onClick={() => setShowAdvancedMetrics((prev) => !prev)}
          >
            {showAdvancedMetrics ? "Απόκρυψη" : "Εμφάνιση"}
          </button>
        </div>

        {showAdvancedMetrics ? (
          <div className="advanced-panel stack-sm">
            <div className="advanced-metrics-grid">
              <article className="metric-box">
                <span className="muted-text">Αναλογία μη προσέλευσης 28ημ</span>
                <strong>{formatPercent(advancedOverview.noShowRatio)}</strong>
              </article>
              <article className="metric-box">
                <span className="muted-text">Εργασίες (ανοικτές/ληξιπρόθεσμες)</span>
                <strong>
                  {advancedOverview.openTasks} / {advancedOverview.overdueTasks}
                </strong>
              </article>
              <article className="metric-box">
                <span className="muted-text">Απλήρωτοι πελάτες</span>
                <strong>
                  {advancedOverview.unpaidClients} ({formatCurrencyEUR(advancedOverview.unpaidAmount)})
                </strong>
              </article>
              <article className="metric-box">
                <span className="muted-text">Υψηλό ρίσκο / Διακοπές ροής</span>
                <strong>
                  {advancedOverview.highRiskClients} / {advancedOverview.streakBreaks}
                </strong>
              </article>
            </div>

            {advancedSignals.length ? (
              <div className="table-wrap">
                <table className="table table-sticky">
                  <thead>
                    <tr>
                      <th>Πελάτης</th>
                      <th>Ρίσκο</th>
                      <th>Αιτίες</th>
                      <th>Εκκρεμή</th>
                      <th>Μη προσέλευση 28ημ</th>
                      <th>Εργασίες</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advancedSignals.slice(0, 10).map((row) => (
                      <tr key={row.clientId}>
                        <td>
                          <Link to={`/clients/${row.clientId}`}>{row.fullName}</Link>
                        </td>
                        <td>{row.riskScore}</td>
                        <td>{row.reasons.join(" | ")}</td>
                        <td>{row.pendingLessons}</td>
                        <td>{row.noShow28}</td>
                        <td>{row.openTasks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">Δεν εντοπίστηκαν προχωρημένα σήματα ρίσκου για τον μήνα αναφοράς.</div>
            )}
          </div>
        ) : (
          <p className="muted-text">
            Τα τεχνικά metrics παραμένουν διαθέσιμα εδώ, χωρίς να επιβαρύνουν την καθημερινή εικόνα προγράμματος.
          </p>
        )}
      </article>
    </section>
  );
}
