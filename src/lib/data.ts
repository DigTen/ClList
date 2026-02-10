import { supabase } from "./supabaseClient";
import type {
  Attendance,
  AutomationSettings,
  AutomationSettingsUpdate,
  ClientNote,
  ClientNoteInsert,
  AttendanceInsert,
  AttendanceStatus,
  AttendanceUpdate,
  Client,
  ClientInsert,
  FollowUpTask,
  FollowUpTaskInsert,
  FollowUpTaskStatus,
  FollowUpTaskUpdate,
  ManagementSignalsRefresh,
  Notification,
  Payment,
  PaymentUpsertInput,
} from "../types/database";

export type LoginLockState = {
  isLocked: boolean;
  lockUntil: string | null;
  failCount: number;
  remainingSeconds: number;
  lockMinutes: number;
};

function normalizePrice(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePayment(payment: Payment): Payment {
  return {
    ...payment,
    price: normalizePrice(payment.price),
  };
}

export async function fetchActiveClients(userId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchPaymentsForMonth(
  userId: string,
  monthStart: string,
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("month_start", monthStart);

  if (error) {
    throw error;
  }

  return (data ?? []).map((payment) => normalizePayment(payment as Payment));
}

export async function addClient(input: ClientInsert): Promise<Client> {
  const { data, error } = await supabase.from("clients").insert(input).select("*").single();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertPayment(input: PaymentUpsertInput): Promise<Payment> {
  const { data, error } = await supabase
    .from("payments")
    .upsert(input, { onConflict: "user_id,client_id,month_start" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizePayment(data as Payment);
}

export async function fetchAttendanceForMonth(
  userId: string,
  monthStart: string,
  nextMonthStart: string,
  status?: AttendanceStatus,
): Promise<Attendance[]> {
  let query = supabase
    .from("attendance")
    .select("*")
    .eq("user_id", userId)
    .gte("session_date", monthStart)
    .lt("session_date", nextMonthStart)
    .order("session_date", { ascending: true })
    .order("time_start", { ascending: true, nullsFirst: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchClients(userId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function upsertAttendance(input: AttendanceInsert): Promise<Attendance> {
  const { data, error } = await supabase
    .from("attendance")
    .upsert(input, { onConflict: "user_id,client_id,session_date,time_start" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Attendance;
}

export async function updateAttendance(id: string, input: AttendanceUpdate): Promise<Attendance> {
  const { data, error } = await supabase
    .from("attendance")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Attendance;
}

export async function deleteAttendance(id: string): Promise<void> {
  const { error } = await supabase.from("attendance").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

function normalizeLockStateRow(row: {
  is_locked: boolean;
  lock_until: string | null;
  fail_count: number;
  remaining_seconds?: number | null;
  lock_minutes?: number | null;
}): LoginLockState {
  return {
    isLocked: row.is_locked,
    lockUntil: row.lock_until,
    failCount: row.fail_count ?? 0,
    remainingSeconds: row.remaining_seconds ?? 0,
    lockMinutes: row.lock_minutes ?? 0,
  };
}

export async function checkLoginLock(email: string): Promise<LoginLockState> {
  const { data, error } = await supabase.rpc("check_login_lock", {
    email_input: email,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return {
      isLocked: false,
      lockUntil: null,
      failCount: 0,
      remainingSeconds: 0,
      lockMinutes: 0,
    };
  }

  return normalizeLockStateRow(row);
}

export async function recordLoginAttempt(email: string, wasSuccess: boolean): Promise<LoginLockState> {
  const { data, error } = await supabase.rpc("record_login_attempt", {
    email_input: email,
    was_success: wasSuccess,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return {
      isLocked: false,
      lockUntil: null,
      failCount: wasSuccess ? 0 : 1,
      remainingSeconds: 0,
      lockMinutes: 0,
    };
  }

  return normalizeLockStateRow(row);
}

export async function fetchFollowUpTasks(
  userId: string,
  statuses?: FollowUpTaskStatus[],
): Promise<FollowUpTask[]> {
  let query = supabase
    .from("follow_up_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data ?? []) as FollowUpTask[];
}

export async function addFollowUpTask(input: FollowUpTaskInsert): Promise<FollowUpTask> {
  const { data, error } = await supabase.from("follow_up_tasks").insert(input).select("*").single();
  if (error) {
    throw error;
  }
  return data as FollowUpTask;
}

export async function updateFollowUpTask(id: string, input: FollowUpTaskUpdate): Promise<FollowUpTask> {
  const { data, error } = await supabase
    .from("follow_up_tasks")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as FollowUpTask;
}

export async function fetchNotifications(userId: string, limit = 25): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return (data ?? []) as Notification[];
}

export async function fetchUnreadNotificationsCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) {
    throw error;
  }
  return count ?? 0;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) {
    throw error;
  }
}

export async function dismissNotification(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) {
    throw error;
  }
}

export async function fetchAutomationSettings(userId: string): Promise<AutomationSettings> {
  const { error: upsertError } = await supabase
    .from("automation_settings")
    .upsert({ user_id: userId }, { onConflict: "user_id" });

  if (upsertError) {
    throw upsertError;
  }

  const { data, error } = await supabase
    .from("automation_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    throw error;
  }

  return data as AutomationSettings;
}

export async function updateAutomationSettings(
  userId: string,
  input: AutomationSettingsUpdate,
): Promise<AutomationSettings> {
  const { data, error } = await supabase
    .from("automation_settings")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return data as AutomationSettings;
}

export async function refreshManagementSignals(): Promise<ManagementSignalsRefresh> {
  const { data, error } = await supabase.rpc("refresh_management_signals");
  if (error) {
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : null;
  return (
    row ?? {
      generated_tasks: 0,
      generated_notifications: 0,
      refreshed_at: new Date().toISOString(),
    }
  );
}

export async function fetchClientById(userId: string, clientId: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return (data as Client | null) ?? null;
}

export async function fetchAttendanceForClientRange(
  userId: string,
  clientId: string,
  fromDate: string,
  toDateExclusive: string,
): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .gte("session_date", fromDate)
    .lt("session_date", toDateExclusive)
    .order("session_date", { ascending: false })
    .order("time_start", { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []) as Attendance[];
}

export async function fetchPaymentsForClient(userId: string, clientId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .order("month_start", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((payment) => normalizePayment(payment as Payment));
}

export async function fetchClientNotes(userId: string, clientId: string): Promise<ClientNote[]> {
  const { data, error } = await supabase
    .from("client_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []) as ClientNote[];
}

export async function addClientNote(input: ClientNoteInsert): Promise<ClientNote> {
  const { data, error } = await supabase.from("client_notes").insert(input).select("*").single();
  if (error) {
    throw error;
  }
  return data as ClientNote;
}

export async function deleteClientNote(id: string): Promise<void> {
  const { error } = await supabase.from("client_notes").delete().eq("id", id);
  if (error) {
    throw error;
  }
}
