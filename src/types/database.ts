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
export type FollowUpTaskPriority = "high" | "medium" | "low";
export type FollowUpTaskStatus = "open" | "in_progress" | "done" | "dismissed";
export type NotificationType = "no_show_risk" | "attendance_drop" | "pending_unpaid_risk" | "manual";

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

export type FollowUpTask = {
  id: string;
  user_id: string;
  client_id: string;
  rule_key: string;
  title: string;
  details: string | null;
  priority: FollowUpTaskPriority;
  status: FollowUpTaskStatus;
  due_date: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type FollowUpTaskInsert = {
  user_id: string;
  client_id: string;
  rule_key: string;
  title: string;
  details: string | null;
  priority: FollowUpTaskPriority;
  status: FollowUpTaskStatus;
  due_date: string;
  resolved_at?: string | null;
};

export type FollowUpTaskUpdate = {
  title?: string;
  details?: string | null;
  priority?: FollowUpTaskPriority;
  status?: FollowUpTaskStatus;
  resolved_at?: string | null;
  updated_at?: string;
};

export type Notification = {
  id: string;
  user_id: string;
  client_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  created_for_date: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

export type AutomationSettings = {
  user_id: string;
  no_show_risk_enabled: boolean;
  attendance_drop_enabled: boolean;
  pending_unpaid_risk_enabled: boolean;
  no_show_threshold: number;
  pending_lessons_threshold: number;
  attendance_drop_ratio: number;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationSettingsUpdate = {
  no_show_risk_enabled?: boolean;
  attendance_drop_enabled?: boolean;
  pending_unpaid_risk_enabled?: boolean;
  no_show_threshold?: number;
  pending_lessons_threshold?: number;
  attendance_drop_ratio?: number;
  updated_at?: string;
};

export type ClientNote = {
  id: string;
  user_id: string;
  client_id: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export type ClientNoteInsert = {
  user_id: string;
  client_id: string;
  note: string;
};

export type ManagementSignalsRefresh = {
  generated_tasks: number;
  generated_notifications: number;
  refreshed_at: string;
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

