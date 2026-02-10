import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import {
  addFollowUpTask,
  fetchActiveClients,
  fetchAutomationSettings,
  fetchFollowUpTasks,
  refreshManagementSignals,
  updateAutomationSettings,
  updateFollowUpTask,
} from "../lib/data";
import { toIsoDate } from "../lib/date";
import type { AutomationSettingsUpdate, FollowUpTaskPriority, FollowUpTaskStatus } from "../types/database";

const STATUS_LABELS: Record<FollowUpTaskStatus, string> = {
  open: "Ανοικτό",
  in_progress: "Σε εξέλιξη",
  done: "Ολοκληρώθηκε",
  dismissed: "Απορρίφθηκε",
};

const PRIORITY_LABELS: Record<FollowUpTaskPriority, string> = {
  high: "Υψηλή",
  medium: "Μεσαία",
  low: "Χαμηλή",
};

function getDueBucket(dueDate: string, today: string): "overdue" | "today" | "upcoming" {
  if (dueDate < today) {
    return "overdue";
  }
  if (dueDate === today) {
    return "today";
  }
  return "upcoming";
}

export function OperationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayIso = toIsoDate(new Date());
  const [newTaskClientId, setNewTaskClientId] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState(todayIso);
  const [newTaskPriority, setNewTaskPriority] = useState<FollowUpTaskPriority>("medium");
  const [settingsDraft, setSettingsDraft] = useState<AutomationSettingsUpdate | null>(null);

  const clientsQuery = useQuery({
    queryKey: ["clients", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchActiveClients(user!.id),
  });

  const tasksQuery = useQuery({
    queryKey: ["follow-up-tasks", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchFollowUpTasks(user!.id),
  });

  const settingsQuery = useQuery({
    queryKey: ["automation-settings", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchAutomationSettings(user!.id),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettingsDraft({
        no_show_risk_enabled: settingsQuery.data.no_show_risk_enabled,
        attendance_drop_enabled: settingsQuery.data.attendance_drop_enabled,
        pending_unpaid_risk_enabled: settingsQuery.data.pending_unpaid_risk_enabled,
        no_show_threshold: settingsQuery.data.no_show_threshold,
        pending_lessons_threshold: settingsQuery.data.pending_lessons_threshold,
        attendance_drop_ratio: settingsQuery.data.attendance_drop_ratio,
      });
    }
  }, [settingsQuery.data]);

  const refreshSignalsMutation = useMutation({
    mutationFn: refreshManagementSignals,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["automation-settings", user?.id] });
      toast.success(`Ανανέωση σημάτων: ${result.generated_tasks} εργασίες, ${result.generated_notifications} ειδοποιήσεις.`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Αποτυχία ανανέωσης σημάτων.";
      toast.error(message);
    },
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
        queryClient.invalidateQueries({ queryKey: ["automation-settings", user.id] });
      })
      .catch(() => {
        // Keep page usable even if background refresh fails.
      });
  }, [queryClient, user?.id]);

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

  const addTaskMutation = useMutation({
    mutationFn: () =>
      addFollowUpTask({
        user_id: user!.id,
        client_id: newTaskClientId,
        rule_key: `manual_follow_up_${newTaskClientId}_${Date.now()}`,
        title: newTaskTitle.trim(),
        details: null,
        priority: newTaskPriority,
        status: "open",
        due_date: newTaskDueDate,
      }),
    onSuccess: () => {
      setNewTaskTitle("");
      setNewTaskClientId("");
      setNewTaskDueDate(todayIso);
      setNewTaskPriority("medium");
      queryClient.invalidateQueries({ queryKey: ["follow-up-tasks", user?.id] });
      toast.success("Η εργασία δημιουργήθηκε.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Αποτυχία δημιουργίας εργασίας.";
      toast.error(message);
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: () => updateAutomationSettings(user!.id, settingsDraft ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-settings", user?.id] });
      toast.success("Οι ρυθμίσεις αυτοματισμών αποθηκεύτηκαν.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Αποτυχία αποθήκευσης ρυθμίσεων.";
      toast.error(message);
    },
  });

  const groupedTasks = useMemo(() => {
    const groups: Record<"overdue" | "today" | "upcoming", typeof tasksQuery.data> = {
      overdue: [],
      today: [],
      upcoming: [],
    };
    (tasksQuery.data ?? []).forEach((task) => {
      const bucket = getDueBucket(task.due_date, todayIso);
      groups[bucket] = [...(groups[bucket] ?? []), task];
    });
    return groups;
  }, [tasksQuery.data, todayIso]);

  if (clientsQuery.isLoading || tasksQuery.isLoading || settingsQuery.isLoading) {
    return <div className="status-box">Φόρτωση αυτοματισμών...</div>;
  }

  if (clientsQuery.isError || tasksQuery.isError || settingsQuery.isError) {
    const message =
      (clientsQuery.error instanceof Error && clientsQuery.error.message) ||
      (tasksQuery.error instanceof Error && tasksQuery.error.message) ||
      (settingsQuery.error instanceof Error && settingsQuery.error.message) ||
      "Δεν ήταν δυνατή η φόρτωση αυτοματισμών.";
    return <div className="status-box status-error">{message}</div>;
  }

  return (
    <section className="stack-md">
      <div className="row space-between align-center wrap">
        <h2>Αυτοματισμοί</h2>
        <button
          type="button"
          className="button button-primary"
          onClick={() => void refreshSignalsMutation.mutateAsync()}
          disabled={refreshSignalsMutation.isPending}
        >
          {refreshSignalsMutation.isPending ? "Ανανέωση..." : "Ανανέωση σημάτων"}
        </button>
      </div>

      <article className="card stack-sm">
        <h3>Κανόνες αυτοματισμών</h3>
        <p className="muted-text">Ρύθμισε πότε δημιουργούνται αυτόματα εργασίες και ειδοποιήσεις.</p>
        {settingsDraft ? (
          <div className="row gap-md wrap">
            <label className="field-label">
              <span>
                <input
                  type="checkbox"
                  checked={Boolean(settingsDraft.no_show_risk_enabled)}
                  onChange={(event) =>
                    setSettingsDraft((previous) => ({ ...(previous ?? {}), no_show_risk_enabled: event.target.checked }))
                  }
                />{" "}
                Κανόνας μη προσέλευσης
              </span>
            </label>
            <label className="field-label">
              <span>
                <input
                  type="checkbox"
                  checked={Boolean(settingsDraft.attendance_drop_enabled)}
                  onChange={(event) =>
                    setSettingsDraft((previous) => ({ ...(previous ?? {}), attendance_drop_enabled: event.target.checked }))
                  }
                />{" "}
                Κανόνας πτώσης προσέλευσης
              </span>
            </label>
            <label className="field-label">
              <span>
                <input
                  type="checkbox"
                  checked={Boolean(settingsDraft.pending_unpaid_risk_enabled)}
                  onChange={(event) =>
                    setSettingsDraft((previous) => ({
                      ...(previous ?? {}),
                      pending_unpaid_risk_enabled: event.target.checked,
                    }))
                  }
                />{" "}
                Κανόνας απλήρωτων εκκρεμοτήτων
              </span>
            </label>
            <label className="field-label">
              <span>Όριο μη προσέλευσης</span>
              <input
                className="input"
                type="number"
                min={1}
                value={settingsDraft.no_show_threshold ?? 2}
                onChange={(event) =>
                  setSettingsDraft((previous) => ({
                    ...(previous ?? {}),
                    no_show_threshold: Number.parseInt(event.target.value, 10) || 1,
                  }))
                }
              />
            </label>
            <label className="field-label">
              <span>Όριο εκκρεμών μαθημάτων</span>
              <input
                className="input"
                type="number"
                min={1}
                value={settingsDraft.pending_lessons_threshold ?? 4}
                onChange={(event) =>
                  setSettingsDraft((previous) => ({
                    ...(previous ?? {}),
                    pending_lessons_threshold: Number.parseInt(event.target.value, 10) || 1,
                  }))
                }
              />
            </label>
            <label className="field-label">
              <span>Αναλογία πτώσης προσέλευσης (0,1-1)</span>
              <input
                className="input"
                type="number"
                min={0.1}
                max={1}
                step={0.05}
                value={settingsDraft.attendance_drop_ratio ?? 0.5}
                onChange={(event) =>
                  setSettingsDraft((previous) => ({
                    ...(previous ?? {}),
                    attendance_drop_ratio: Number.parseFloat(event.target.value) || 0.5,
                  }))
                }
              />
            </label>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void saveSettingsMutation.mutateAsync()}
              disabled={saveSettingsMutation.isPending}
            >
              {saveSettingsMutation.isPending ? "Αποθήκευση..." : "Αποθήκευση κανόνων"}
            </button>
          </div>
        ) : null}
      </article>

      <article className="card stack-sm">
        <h3>Εργασίες παρακολούθησης</h3>
        {(["overdue", "today", "upcoming"] as const).map((bucket) => {
          const title = bucket === "overdue" ? "Ληξιπρόθεσμα" : bucket === "today" ? "Σήμερα" : "Επόμενα";
          const items = groupedTasks[bucket] ?? [];
          return (
            <section key={bucket} className="stack-sm">
              <h4>
                {title} ({items.length})
              </h4>
              {items.length ? (
                <div className="stack-sm">
                  {items.map((task) => (
                    <article key={task.id} className="task-item">
                      <div className="row space-between align-center wrap gap-sm">
                        <div className="stack-sm">
                          <strong>{task.title}</strong>
                          <span className="muted-text">
                            Προθεσμία: {task.due_date} • Προτεραιότητα: {PRIORITY_LABELS[task.priority]}
                          </span>
                          {task.details ? <span>{task.details}</span> : null}
                        </div>
                        <span className={`priority-chip priority-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
                      </div>

                      <div className="row gap-sm wrap align-center">
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
                          <option value="open">{STATUS_LABELS.open}</option>
                          <option value="in_progress">{STATUS_LABELS.in_progress}</option>
                          <option value="done">{STATUS_LABELS.done}</option>
                          <option value="dismissed">{STATUS_LABELS.dismissed}</option>
                        </select>
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            toast.info("Καταγραφή κλήσης πελάτη (προσεχώς).");
                          }}
                        >
                          Κλήση πελάτη
                        </button>
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            const note = window.prompt("Σημείωση παρακολούθησης");
                            if (!note?.trim()) {
                              return;
                            }
                            void updateTaskMutation.mutateAsync({
                              id: task.id,
                              status: task.status,
                            });
                            toast.success("Η σημείωση καταγράφηκε στην εργασία.");
                          }}
                        >
                          Σημείωση
                        </button>
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() =>
                            void updateTaskMutation.mutateAsync({
                              id: task.id,
                              status: "done",
                            })
                          }
                        >
                          Ολοκλήρωση
                        </button>
                        <Link className="button" to={`/clients/${task.client_id}`}>
                          Άνοιγμα προφίλ
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Δεν υπάρχουν εργασίες στην κατηγορία {title.toLowerCase()}.</div>
              )}
            </section>
          );
        })}
      </article>

      <article className="card stack-sm">
        <h3>Προσθήκη εργασίας (χειροκίνητα)</h3>
        <form
          className="row gap-sm wrap align-end"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!newTaskClientId || !newTaskTitle.trim()) {
              toast.error("Συμπλήρωσε πελάτη και τίτλο.");
              return;
            }
            void addTaskMutation.mutateAsync();
          }}
        >
          <label className="field-label">
            <span>Πελάτης</span>
            <select className="input" value={newTaskClientId} onChange={(event) => setNewTaskClientId(event.target.value)}>
              <option value="">Επίλεξε</option>
              {(clientsQuery.data ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>Τίτλος</span>
            <input className="input" value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} />
          </label>
          <label className="field-label">
            <span>Ημερομηνία</span>
            <input
              className="input"
              type="date"
              value={newTaskDueDate}
              onChange={(event) => setNewTaskDueDate(event.target.value)}
            />
          </label>
          <label className="field-label">
            <span>Προτεραιότητα</span>
            <select
              className="input"
              value={newTaskPriority}
              onChange={(event) => setNewTaskPriority(event.target.value as FollowUpTaskPriority)}
            >
              <option value="high">Υψηλή</option>
              <option value="medium">Μεσαία</option>
              <option value="low">Χαμηλή</option>
            </select>
          </label>
          <button type="submit" className="button button-primary" disabled={addTaskMutation.isPending}>
            {addTaskMutation.isPending ? "Δημιουργία..." : "Δημιουργία εργασίας"}
          </button>
        </form>
      </article>
    </section>
  );
}
