export type Client = {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  user_id: string;
};

export type Payment = {
  id: string;
  client_id: string;
  month_start: string;
  lessons: number | null;
  price: number | null;
  paid: boolean;
  notes: string | null;
  user_id: string;
  created_at: string;
};

export type ClientInsert = {
  full_name: string;
  phone: string | null;
  user_id: string;
};

export type PaymentUpsertInput = {
  client_id: string;
  month_start: string;
  lessons: number | null;
  price: number | null;
  paid: boolean;
  notes: string | null;
  user_id: string;
};

