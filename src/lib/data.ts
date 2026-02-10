import { supabase } from "./supabaseClient";
import type {
  Attendance,
  AttendanceInsert,
  AttendanceStatus,
  AttendanceUpdate,
  Client,
  ClientInsert,
  Payment,
  PaymentUpsertInput,
} from "../types/database";

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
