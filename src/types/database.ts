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

export type AttendanceStatus = "attended" | "canceled" | "no_show";
export type AttendanceBedType = "reformer" | "cadillac";

export type Attendance = {
  id: string;
  user_id: string;
  client_id: string;
  session_date: string;
  time_start: string | null;
  duration_minutes: number | null;
  bed_type: AttendanceBedType;
  status: AttendanceStatus;
  notes: string | null;
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

export type AttendanceInsert = {
  user_id: string;
  client_id: string;
  session_date: string;
  time_start: string;
  duration_minutes: number | null;
  bed_type: AttendanceBedType;
  status: AttendanceStatus;
  notes: string | null;
};

export type AttendanceUpdate = {
  client_id: string;
  session_date: string;
  time_start: string;
  duration_minutes: number | null;
  bed_type: AttendanceBedType;
  status: AttendanceStatus;
  notes: string | null;
};

