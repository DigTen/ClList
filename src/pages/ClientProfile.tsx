import { FormEvent, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import {
  addClientNote,
  deleteClientNote,
  fetchAttendanceForClientRange,
  fetchClientById,
  fetchClientNotes,
  fetchFollowUpTasks,
  fetchPaymentsForClient,
  updateFollowUpTask,
} from "../lib/data";
import { addDays, startOfMonth, toIsoDate } from "../lib/date";
import { formatCurrencyEUR } from "../lib/format";
import type { AttendanceStatus, FollowUpTaskStatus } from "../types/database";

function daysAgo(date: Date, amount: number): Date {
  return addDays(date, -amount);
}

function formatAttendanceStatusLabel(status: AttendanceStatus): string {
  if (status === "attended") {
    return "Παρουσία";
  }
  if (status === "canceled") {
    return "Ακύρωση";
  }
  return "Απουσία";
}

function formatTaskStatusLabel(status: FollowUpTaskStatus): string {
  if (status === "open") {
    return "Ανοιχτή";
  }
  if (status === "in_progress") {
    return "Σε εξέλιξη";
  }
  if (status === "done") {
    return "Ολοκληρώθηκε";
  }
  return "Απορρίφθηκε";
}

function formatPriorityLabel(priority: "high" | "medium" | "low"): string {
  if (priority === "high") {
    return "Υψηλή";
  }
  if (priority === "medium") {
    return "Μεσαία";
  }
  return "Χαμηλή";
}

function formatBedLabel(bedType: "reformer" | "cadillac"): string {
  return bedType === "cadillac" ? "CADILLAC" : "REFORMER";
}

type AttendanceFilter = "all" | AttendanceStatus;
type PaymentFilter = "all" | "paid" | "unpaid";
type TaskFilter = "all" | FollowUpTaskStatus;

export function ClientProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { clientId = "" } = useParams();

  const [noteText, setNoteText] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [attendanceSearch, setAttendanceSearch] = useState("");

  const now = new Date();
  const fromDate = toIsoDate(daysAgo(now, 90));
  const toDateExclusive = toIsoDate(addDays(now, 1));
  const currentMonthStart = toIsoDate(startOfMonth(now));
  const nextMonthStart = toIsoDate(startOfMonth(addDays(now, 32)));

  const clientQuery = useQuery({
    queryKey: ["client", user?.id, clientId],
    enabled: Boolean(user?.id && clientId),
    queryFn: () => fetchClientById(user!.id, clientId),
  });

  const attendanceQuery = useQuery({
    queryKey: ["client-attendance", user?.id, clientId, fromDate, toDateExclusive],
    enabled: Boolean(user?.id && clientId),
    queryFn: () => fetchAttendanceForClientRange(user!.id, clientId, fromDate, toDateExclusive),
  });

  const paymentsQuery = useQuery({
    queryKey: ["client-payments", user?.id, clientId],
    enabled: Boolean(user?.id && clientId),
    queryFn: () => fetchPaymentsForClient(user!.id, clientId),
  });

  const tasksQuery = useQuery({
    queryKey: ["follow-up-tasks", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchFollowUpTasks(user!.id),
  });

  const notesQuery = useQuery({
    queryKey: ["client-notes", user?.id, clientId],
    enabled: Boolean(user?.id && clientId),
    queryFn: () => fetchClientNotes(user!.id, clientId),
  });

  const addNoteMutation = useMutation({
    mutationFn: () => addClientNote({ user_id: user!.id, client_id: clientId, note: noteText.trim() }),
    onSuccess: () => {
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["client-notes", user?.id, clientId] });
      toast.success("Η σημείωση αποθηκεύτηκε.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Αποτυχία αποθήκευσης σημείωσης.";
      toast.error(message);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => deleteClientNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes", user?.id, clientId] });
      toast.success("Η σημείωση διαγράφηκε.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Αποτυχία διαγραφής σημείωσης.";
      toast.error(message);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FollowUpTaskStatus }) =>
      updateFollowUpTask(id, {
        status,
        resolved_at: status === "done" || status === "dismissed" ? new Date().toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks", user?.id] });
      toast.success("Η εργασία ενημερώθηκε.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Αποτυχία ενημέρωσης εργασίας.";
      toast.error(message);
    },
  });

  const attendanceEntries = attendanceQuery.data ?? [];
  const paymentEntries = paymentsQuery.data ?? [];
  const noteEntries = notesQuery.data ?? [];

  const clientTasks = useMemo(() => {
    return (tasksQuery.data ?? [])
      .filter((task) => task.client_id === clientId)
      .sort((a, b) => {
        const dueCompare = a.due_date.localeCompare(b.due_date);
        if (dueCompare !== 0) {
          return dueCompare;
        }
        return b.created_at.localeCompare(a.created_at);
      });
  }, [clientId, tasksQuery.data]);

  const attendanceCounts = useMemo(() => {
    return attendanceEntries.reduce(
      (acc, entry) => {
        acc.total += 1;
        if (entry.status === "attended") {
          acc.attended += 1;
        } else if (entry.status === "canceled") {
          acc.canceled += 1;
        } else {
          acc.noShow += 1;
        }
        return acc;
      },
      { total: 0, attended: 0, canceled: 0, noShow: 0 },
    );
  }, [attendanceEntries]);

  const attendanceRate = attendanceCounts.total > 0 ? Math.round((attendanceCounts.attended / attendanceCounts.total) * 100) : 0;

  const unpaidCount = useMemo(() => paymentEntries.filter((payment) => !payment.paid).length, [paymentEntries]);
  const openTasksCount = useMemo(
    () => clientTasks.filter((task) => task.status === "open" || task.status === "in_progress").length,
    [clientTasks],
  );

  const currentMonthPayment = useMemo(
    () => paymentEntries.find((payment) => payment.month_start === currentMonthStart),
    [currentMonthStart, paymentEntries],
  );

  const attendedCurrentMonth = useMemo(() => {
    return attendanceEntries.filter(
      (entry) => entry.status === "attended" && entry.session_date >= currentMonthStart && entry.session_date < nextMonthStart,
    ).length;
  }, [attendanceEntries, currentMonthStart, nextMonthStart]);

  const plannedCurrentMonth = currentMonthPayment?.lessons ?? 0;
  const pendingCurrentMonth = Math.max(0, plannedCurrentMonth - attendedCurrentMonth);
  const overusedCurrentMonth = Math.max(0, attendedCurrentMonth - plannedCurrentMonth);

  const filteredAttendance = useMemo(() => {
    const normalized = attendanceSearch.trim().toLowerCase();
    return attendanceEntries
      .filter((entry) => (attendanceFilter === "all" ? true : entry.status === attendanceFilter))
      .filter((entry) => {
        if (!normalized) {
          return true;
        }
        const notes = entry.notes?.toLowerCase() ?? "";
        const bed = formatBedLabel(entry.bed_type).toLowerCase();
        const status = formatAttendanceStatusLabel(entry.status).toLowerCase();
        return notes.includes(normalized) || bed.includes(normalized) || status.includes(normalized) || entry.session_date.includes(normalized);
      })
      .sort((a, b) => {
        const dateCompare = b.session_date.localeCompare(a.session_date);
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return (a.time_start ?? "").localeCompare(b.time_start ?? "");
      });
  }, [attendanceEntries, attendanceFilter, attendanceSearch]);

  const filteredPayments = useMemo(() => {
    const base = [...paymentEntries].sort((a, b) => b.month_start.localeCompare(a.month_start));
    if (paymentFilter === "all") {
      return base;
    }
    return base.filter((entry) => (paymentFilter === "paid" ? entry.paid : !entry.paid));
  }, [paymentEntries, paymentFilter]);

  const filteredTasks = useMemo(() => {
    if (taskFilter === "all") {
      return clientTasks;
    }
    return clientTasks.filter((task) => task.status === taskFilter);
  }, [clientTasks, taskFilter]);

  if (clientQuery.isLoading || attendanceQuery.isLoading || paymentsQuery.isLoading || tasksQuery.isLoading || notesQuery.isLoading) {
    return <div className="status-box">Φόρτωση προφίλ πελάτη...</div>;
  }

  if (clientQuery.isError || attendanceQuery.isError || paymentsQuery.isError || tasksQuery.isError || notesQuery.isError) {
    const message =
      (clientQuery.error instanceof Error && clientQuery.error.message) ||
      (attendanceQuery.error instanceof Error && attendanceQuery.error.message) ||
      (paymentsQuery.error instanceof Error && paymentsQuery.error.message) ||
      (tasksQuery.error instanceof Error && tasksQuery.error.message) ||
      (notesQuery.error instanceof Error && notesQuery.error.message) ||
      "Δεν ήταν δυνατή η φόρτωση προφίλ πελάτη.";
    return <div className="status-box status-error">{message}</div>;
  }

  if (!clientQuery.data) {
    return <div className="status-box status-error">Ο πελάτης δεν βρέθηκε.</div>;
  }

  return (
    <section className="stack-md">
      <article className="card client-profile-header">
        <div className="stack-sm">
          <h2>{clientQuery.data.full_name}</h2>
          <p className="muted-text">Τηλέφωνο: {clientQuery.data.phone ?? "-"}</p>
          <div className="row gap-sm wrap">
            <span className="status-pill">Κατάσταση: {clientQuery.data.is_active ? "Ενεργός" : "Ανενεργός"}</span>
            <span className="status-pill">Παρουσία 90ημ: {attendanceRate}%</span>
          </div>
        </div>
        <div className="row gap-sm wrap client-profile-actions">
          <Link className="button" to="/calendar">
            Ημερολόγιο
          </Link>
          <Link className="button" to="/payments">
            Πληρωμές
          </Link>
          <Link className="button" to="/operations">
            Αυτοματισμοί
          </Link>
        </div>
      </article>

      <div className="client-profile-kpi-grid">
        <article className="card client-profile-kpi-card">
          <span className="muted-text">Παρουσίες (90ημ)</span>
          <strong>{attendanceCounts.attended}</strong>
        </article>
        <article className="card client-profile-kpi-card">
          <span className="muted-text">Ακυρώσεις (90ημ)</span>
          <strong>{attendanceCounts.canceled}</strong>
        </article>
        <article className="card client-profile-kpi-card">
          <span className="muted-text">Απουσίες (90ημ)</span>
          <strong>{attendanceCounts.noShow}</strong>
        </article>
        <article className="card client-profile-kpi-card">
          <span className="muted-text">Απλήρωτοι μήνες</span>
          <strong>{unpaidCount}</strong>
        </article>
        <article className="card client-profile-kpi-card">
          <span className="muted-text">Ανοιχτές εργασίες</span>
          <strong>{openTasksCount}</strong>
        </article>
      </div>

      <article className="card stack-sm">
        <h3>Έλεγχος τρέχοντος μήνα</h3>
        <div className="row gap-sm wrap">
          <span className="status-pill">Μαθήματα πακέτου: {plannedCurrentMonth}</span>
          <span className="status-pill status-attended">Παρουσίες: {attendedCurrentMonth}</span>
          <span className={`status-pill ${pendingCurrentMonth > 0 ? "status-no-show" : ""}`}>Εκκρεμή: {pendingCurrentMonth}</span>
          <span className={`status-pill ${overusedCurrentMonth > 0 ? "status-canceled" : ""}`}>Υπέρβαση: +{overusedCurrentMonth}</span>
          <span className={`status-pill ${currentMonthPayment && !currentMonthPayment.paid ? "status-canceled" : "status-attended"}`}>
            Πληρωμή μήνα: {currentMonthPayment ? (currentMonthPayment.paid ? "Εξοφλημένο" : "Απλήρωτο") : "Χωρίς εγγραφή"}
          </span>
        </div>
      </article>

      <div className="client-profile-grid">
        <article className="card stack-sm">
          <div className="client-profile-section-toolbar">
            <h3>Εργασίες παρακολούθησης</h3>
            <label className="field-label client-profile-inline-field">
              <span>Φίλτρο</span>
              <select className="input" value={taskFilter} onChange={(event) => setTaskFilter(event.target.value as TaskFilter)}>
                <option value="all">Όλες</option>
                <option value="open">Ανοιχτές</option>
                <option value="in_progress">Σε εξέλιξη</option>
                <option value="done">Ολοκληρωμένες</option>
                <option value="dismissed">Απορριφθείσες</option>
              </select>
            </label>
          </div>

          {filteredTasks.length ? (
            <div className="client-profile-list">
              {filteredTasks.map((task) => (
                <article key={task.id} className="task-item">
                  <div className="row space-between align-center wrap gap-sm">
                    <div className="stack-sm">
                      <strong>{task.title}</strong>
                      <span className="muted-text">Προθεσμία: {new Date(task.due_date).toLocaleDateString("el-GR")}</span>
                      <span className="muted-text">Προτεραιότητα: {formatPriorityLabel(task.priority)}</span>
                    </div>
                    <select
                      className="input task-status-select"
                      value={task.status}
                      onChange={(event) =>
                        void updateTaskMutation.mutateAsync({
                          id: task.id,
                          status: event.target.value as FollowUpTaskStatus,
                        })
                      }
                    >
                      <option value="open">Ανοιχτή</option>
                      <option value="in_progress">Σε εξέλιξη</option>
                      <option value="done">Ολοκληρώθηκε</option>
                      <option value="dismissed">Απορρίφθηκε</option>
                    </select>
                  </div>
                  {task.details ? <p>{task.details}</p> : null}
                  <span className="muted-text">Κατάσταση: {formatTaskStatusLabel(task.status)}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Δεν υπάρχουν εργασίες για τα επιλεγμένα φίλτρα.</div>
          )}
        </article>

        <article className="card stack-sm">
          <h3>Σημειώσεις πελάτη</h3>
          <form
            className="stack-sm"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (!noteText.trim()) {
                toast.error("Συμπλήρωσε σημείωση.");
                return;
              }
              void addNoteMutation.mutateAsync();
            }}
          >
            <label className="field-label">
              <span>Νέα σημείωση</span>
              <textarea className="input" value={noteText} rows={3} onChange={(event) => setNoteText(event.target.value)} />
            </label>
            <div className="row space-between align-center wrap gap-sm">
              <span className="muted-text">{noteText.trim().length} χαρακτήρες</span>
              <button type="submit" className="button button-primary" disabled={addNoteMutation.isPending}>
                {addNoteMutation.isPending ? "Αποθήκευση..." : "Αποθήκευση σημείωσης"}
              </button>
            </div>
          </form>

          {noteEntries.length ? (
            <div className="client-profile-list">
              {noteEntries.map((note) => (
                <article key={note.id} className="task-item">
                  <div className="row space-between align-center wrap gap-sm">
                    <span>{note.note}</span>
                    <button type="button" className="button" onClick={() => void deleteNoteMutation.mutateAsync(note.id)}>
                      Διαγραφή
                    </button>
                  </div>
                  <span className="muted-text">{new Date(note.created_at).toLocaleString("el-GR")}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Δεν υπάρχουν σημειώσεις για αυτόν τον πελάτη.</div>
          )}
        </article>

        <article className="card stack-sm">
          <div className="client-profile-section-toolbar">
            <h3>Παρουσίες (90 ημέρες)</h3>
            <div className="row gap-sm wrap client-profile-inline-controls">
              <label className="field-label client-profile-inline-field">
                <span>Κατάσταση</span>
                <select className="input" value={attendanceFilter} onChange={(event) => setAttendanceFilter(event.target.value as AttendanceFilter)}>
                  <option value="all">Όλες</option>
                  <option value="attended">Παρουσία</option>
                  <option value="canceled">Ακύρωση</option>
                  <option value="no_show">Απουσία</option>
                </select>
              </label>
              <label className="field-label client-profile-inline-field">
                <span>Αναζήτηση</span>
                <input
                  className="input"
                  value={attendanceSearch}
                  onChange={(event) => setAttendanceSearch(event.target.value)}
                  placeholder="Σημείωση/κρεβάτι/κατάσταση"
                />
              </label>
            </div>
          </div>

          {filteredAttendance.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ημερομηνία</th>
                    <th>Ώρα</th>
                    <th>Κρεβάτι</th>
                    <th>Κατάσταση</th>
                    <th>Σημειώσεις</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.session_date).toLocaleDateString("el-GR")}</td>
                      <td>{entry.time_start?.slice(0, 5) ?? "-"}</td>
                      <td>{formatBedLabel(entry.bed_type)}</td>
                      <td>
                        <span className={`status-pill status-${entry.status.replace("_", "-")}`}>
                          {formatAttendanceStatusLabel(entry.status)}
                        </span>
                      </td>
                      <td>{entry.notes ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">Δεν υπάρχουν παρουσίες για τα επιλεγμένα φίλτρα.</div>
          )}
        </article>

        <article className="card stack-sm">
          <div className="client-profile-section-toolbar">
            <h3>Πληρωμές</h3>
            <label className="field-label client-profile-inline-field">
              <span>Κατάσταση</span>
              <select className="input" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as PaymentFilter)}>
                <option value="all">Όλες</option>
                <option value="unpaid">Απλήρωτες</option>
                <option value="paid">Εξοφλημένες</option>
              </select>
            </label>
          </div>

          {filteredPayments.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Μήνας</th>
                    <th>Μαθήματα</th>
                    <th>Τιμή</th>
                    <th>Κατάσταση</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{new Date(payment.month_start).toLocaleDateString("el-GR", { month: "long", year: "numeric" })}</td>
                      <td>{payment.lessons ?? 0}</td>
                      <td>{formatCurrencyEUR(payment.price ?? 0)}</td>
                      <td>
                        <span className={`status-pill ${payment.paid ? "status-attended" : "status-canceled"}`}>
                          {payment.paid ? "Εξοφλημένη" : "Απλήρωτη"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">Δεν υπάρχουν πληρωμές για τα επιλεγμένα φίλτρα.</div>
          )}
        </article>
      </div>
    </section>
  );
}
