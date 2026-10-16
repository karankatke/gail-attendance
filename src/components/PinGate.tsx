import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";

export function PinGate() {
  const { signInWithPin } = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError("Enter your PIN.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await signInWithPin(pin);
    setBusy(false);
    if (err) {
      setPin("");
      setError(err);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="17" rx="3" />
              <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
              <path d="M8 14l2.2 2.2L16 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Attendance Register</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the family PIN to continue</p>
        </div>

        <input
          inputMode="numeric"
          autoFocus
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />

        {error ? <p className="mt-3 text-center text-sm text-red-600">{error}</p> : null}

        <Button type="submit" disabled={busy} className="mt-4 w-full py-3">
          {busy ? "Checking…" : "Unlock"}
        </Button>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          You stay signed in on this phone. Tap the link, enter PIN once.
        </p>
      </form>
    </div>
  );
}
