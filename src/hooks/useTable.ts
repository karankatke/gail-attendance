import { useCallback, useEffect, useState } from "react";
import { requireClient } from "../lib/supabase";

interface UseTableOptions {
  orderColumn?: string;
  ascending?: boolean;
}

/**
 * Loads a table and keeps it in sync via Supabase Realtime.
 * Every phone subscribed refetches whenever any row changes.
 */
export function useTable<T>(table: string, options: UseTableOptions = {}) {
  const { orderColumn, ascending = true } = options;
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = requireClient();
    let query = client.from(table).select("*");
    if (orderColumn) query = query.order(orderColumn, { ascending });
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
    } else {
      setRows((data ?? []) as T[]);
      setError(null);
    }
    setLoading(false);
  }, [table, orderColumn, ascending]);

  useEffect(() => {
    let cancelled = false;
    const client = requireClient();

    const run = async () => {
      if (!cancelled) await load();
    };
    run();

    const channel = client
      .channel(`realtime-${table}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (!cancelled) load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, [table, load]);

  return { rows, loading, error, refetch: load };
}
