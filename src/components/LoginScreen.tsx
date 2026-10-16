import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { enroll, fetchLoginDirectory, requestAccess } from "../lib/db";
import { Button, Card, Field, Spinner, inputClass } from "./ui";
import type { LoginEntry } from "../lib/types";

const STATUS_LABEL: Record<string, string> = {
  unclaimed: "Not set up",
  pending: "Waiting for approval",
  approved: "Ready to set PIN",
  active: "Active",
};

export function LoginScreen() {
  const { signInWithPin } = useAuth();
  const [entries, setEntries] = useState<LoginEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LoginEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await fetchLoginDirectory());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    await load();
    if (selected) {
      const next = (await fetchLoginDirectory()).find((e) => e.id === selected.id);
      setSelected(next ?? null);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="17" rx="3" />
              <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
              <path d="M8 14l2.2 2.2L16 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Attendance Register</h1>
          <p className="mt-1 text-sm text-slate-500">Tap your name to continue</p>
        </div>

        {error ? <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        {selected ? (
          <SelectedPanel
            entry={selected}
            onBack={() => setSelected(null)}
            onRefresh={refresh}
            signInWithPin={signInWithPin}
          />
        ) : loading ? (
          <Spinner />
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <Card key={e.id} className="p-0">
                <button
                  onClick={() => setSelected(e)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {e.display_name}
                      {e.role === "owner" ? (
                        <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700">
                          Owner
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">{STATUS_LABEL[e.status] ?? e.status}</p>
                  </div>
                  <span className="text-slate-300">›</span>
                </button>
              </Card>
            ))}
            {entries.length === 0 ? (
              <p className="text-center text-sm text-slate-400">No users set up yet.</p>
            ) : null}
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-slate-400">
          You stay signed in on this phone. Enter your PIN once.
        </p>
      </div>
    </div>
  );
}

function SelectedPanel({
  entry,
  onBack,
  onRefresh,
  signInWithPin,
}: {
  entry: LoginEntry;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  signInWithPin: (email: string, pin: string) => Promise<{ error: string | null }>;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    if (!entry.login_email) {
      setError("This account is not active yet.");
      return;
    }
    if (pin.length < 4) {
      setError("Enter your PIN.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await signInWithPin(entry.login_email, pin);
    if (err) {
      setPin("");
      setError(err);
      setBusy(false);
    }
  };

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestAccess(entry.id);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send request");
      setBusy(false);
    }
  };

  const createPin = async () => {
    if (pin.length < 4) {
      setError("Use at least 4 digits.");
      return;
    }
    if (pin !== confirm) {
      setError("The two PINs do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { email } = await enroll(entry.id, pin);
      const { error: err } = await signInWithPin(email, pin);
      if (err) {
        setError(err);
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create login");
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <button onClick={onBack} className="mb-3 text-sm font-medium text-brand-700">
        ‹ All users
      </button>
      <h2 className="text-lg font-bold text-slate-900">{entry.display_name}</h2>
      <p className="mb-4 text-xs text-slate-500">{STATUS_LABEL[entry.status] ?? entry.status}</p>

      {entry.status === "active" ? (
        <div className="space-y-4">
          <input
            inputMode="numeric"
            autoFocus
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button onClick={signIn} disabled={busy} className="w-full py-3">
            {busy ? "Checking…" : "Unlock"}
          </Button>
        </div>
      ) : entry.status === "unclaimed" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Ask the owner to approve you, then set your own PIN here.
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button onClick={request} disabled={busy} className="w-full py-3">
            {busy ? "Sending…" : "Request access"}
          </Button>
        </div>
      ) : entry.status === "pending" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Your request has been sent. Wait for the owner to approve, then tap refresh.
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button variant="secondary" onClick={onRefresh} disabled={busy} className="w-full py-3">
            Refresh
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">You are approved. Choose a PIN to finish setup.</p>
          <Field label="New PIN">
            <input
              inputMode="numeric"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className={inputClass}
              placeholder="at least 4 digits"
            />
          </Field>
          <Field label="Confirm PIN">
            <input
              inputMode="numeric"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button onClick={createPin} disabled={busy} className="w-full py-3">
            {busy ? "Setting up…" : "Create my login"}
          </Button>
        </div>
      )}
    </Card>
  );
}
