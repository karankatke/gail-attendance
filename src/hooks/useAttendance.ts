import { useCallback, useEffect, useState } from "react";
import { requireClient } from "../lib/supabase";
import type { Attendance } from "../lib/types";

export function useAttendance(date: string) {
  const [byWorker, setByWorker] = useState<Record<string, Attendance>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const client = requireClient();
    const { data, error } = await client
      .from("attendance")
      .select("*")
      .eq("work_date", date);
    if (!error) {
      const map: Record<string, Attendance> = {};
      for (const a of (data ?? []) as Attendance[]) map[a.worker_id] = a;
      setByWorker(map);
    }
    setLoading(false);
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    const client = requireClient();
    const run = async () => {
      if (!cancelled) await load();
    };
    run();
    const channel = client
      .channel(`realtime-attendance-${date}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance" },
        () => {
          if (!cancelled) load();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, [date, load]);

  return { byWorker, loading, refetch: load };
}
