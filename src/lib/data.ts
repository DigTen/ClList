import { supabase } from "./supabaseClient";
import type { Client, ClientInsert, Payment, PaymentUpsertInput } from "../types/database";

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
