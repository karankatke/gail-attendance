export type RateMode = "day" | "hour";
export type AttendanceStatus = "present" | "half_day" | "absent";
export type AdjustmentType = "advance" | "deduction" | "bonus";

export interface Role {
  id: string;
  name: string;
  day_rate: number;
  hour_rate: number;
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
  hour_rate: number | null;
  active: boolean;
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
  pay_amount: number;
  pay_overridden: boolean;
  note: string | null;
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

export interface ReportRow {
  worker_id: string;
  worker_name: string;
  role_name: string | null;
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
