export type RateMode = "day" | "month";
export type AttendanceStatus = "present" | "half_day" | "absent";
export type AdjustmentType = "advance" | "deduction" | "bonus";
export type UserRole = "owner" | "supervisor";
export type ProfileStatus = "unclaimed" | "pending" | "approved" | "active";
export type BataCategory = "lunch" | "travel" | "material" | "other";

export interface Role {
  id: string;
  name: string;
  day_rate: number;
  month_rate: number;
  active: boolean;
  created_at: string;
}

export interface WorkLocation {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  created_at: string;
}

export interface Worker {
  id: string;
  name: string;
  phone: string | null;
  role_id: string | null;
  rate_mode: RateMode;
  day_rate: number | null;
  month_rate: number | null;
  active: boolean;
  added_by_profile_id: string | null;
  added_at: string | null;
  needs_rate: boolean;
  created_at: string;
}

export interface Attendance {
  id: string;
  worker_id: string;
  work_date: string;
  location_id: string | null;
  role_id: string | null;
  status: AttendanceStatus;
  hours: number | null;
  note: string | null;
  marked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Advance {
  id: string;
  worker_id: string;
  entry_date: string;
  type: AdjustmentType;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface PayOverride {
  id: string;
  worker_id: string;
  work_date: string;
  amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string | null;
  display_name: string;
  role: UserRole;
  login_email: string;
  status: ProfileStatus;
  worker_id: string | null;
  active: boolean;
  created_at: string;
  requested_at: string | null;
  approved_at: string | null;
  last_seen_at: string | null;
}

export interface LoginEntry {
  id: string;
  display_name: string;
  role: UserRole;
  status: ProfileStatus;
  login_email: string | null;
}

export interface BataGrant {
  id: string;
  supervisor_profile_id: string;
  grant_date: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface BataExpense {
  id: string;
  supervisor_profile_id: string;
  expense_date: string;
  category: BataCategory;
  qty: number | null;
  unit_rate: number | null;
  amount: number;
  note: string | null;
  location_id: string | null;
  created_at: string;
}

export interface PublicWorker {
  id: string;
  name: string;
  role_id: string | null;
  role_name: string | null;
  active: boolean;
  supervisor_profile_id: string | null;
}

export interface PublicRole {
  id: string;
  name: string;
}

export interface DayAttendanceRow {
  worker_id: string;
  worker_name: string;
  role_name: string | null;
  status: AttendanceStatus;
  location_id: string | null;
  location_name: string | null;
  marked_by_profile_id: string | null;
  marked_by_name: string | null;
  note: string | null;
  updated_at: string;
}

export interface ReportRow {
  worker_id: string;
  worker_name: string;
  role_name: string | null;
  rate_mode: RateMode;
  days_present: number;
  days_half: number;
  days_absent: number;
  total_hours: number;
  gross_pay: number;
  advances: number;
  deductions: number;
  bonuses: number;
  net_pay: number;
}

export interface LocationReportRow {
  location_id: string | null;
  location_name: string;
  worker_days: number;
  total_hours: number;
  gross_pay: number;
}

export interface BataReportRow {
  supervisor_profile_id: string;
  supervisor_name: string;
  granted: number;
  spent: number;
  balance: number;
  lunch: number;
  travel: number;
  material: number;
  other: number;
}

export type MeterStatus = "draft" | "done";
export type MeterPhotoKind = "meter" | "valve";

export interface SiteFlat {
  id: string;
  location_id: string;
  flat_number: string;
  flat_key: string;
  tower: string | null;
  floor: number | null;
  bp_number: string | null;
  application_no: string | null;
  consumer_name: string | null;
  society: string | null;
  ga_status: string | null;
  sd_available: number | null;
  sl_no: number | null;
  source: "import" | "manual";
  active: boolean;
  created_by_profile_id: string | null;
  created_at: string;
}

export interface MeterRecord {
  id: string;
  site_flat_id: string;
  location_id: string;
  meter_reading: number | null;
  meter_make: string | null;
  work_date: string;
  remarks: string | null;
  meter_photo_path: string | null;
  valve_photo_path: string | null;
  status: MeterStatus;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeterFlatRow {
  flat: SiteFlat;
  record: MeterRecord | null;
}
