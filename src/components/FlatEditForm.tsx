import { useState } from "react";
import { Button, Field, Modal, inputClass } from "./ui";
import { deleteSiteFlat, updateSiteFlat } from "../lib/db";
import type { SiteFlat } from "../lib/types";

/** Edit (or delete) a flat a supervisor added by hand. */
export function FlatEditForm({
  flat,
  hasRecord,
  onClose,
  onSaved,
}: {
  flat: SiteFlat;
  hasRecord: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [flatNumber, setFlatNumber] = useState(flat.flat_number);
  const [bpNumber, setBpNumber] = useState(flat.bp_number ?? "");
  const [consumerName, setConsumerName] = useState(flat.consumer_name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const num = flatNumber.trim().toUpperCase();
    if (!num) {
      setError("Enter the flat number.");
      return;
    }
    const tower = num.match(/^[A-Z]/)?.[0] ?? null;
    const digits = Number(num.replace(/\D/g, ""));
    setBusy(true);
    setError(null);
    try {
      await updateSiteFlat(flat.id, {
        flat_number: num,
        flat_key: num.replace(/[^A-Z0-9]/g, ""),
        tower,
        floor: Number.isFinite(digits) && digits > 0 ? Math.floor(digits / 100) : null,
        bp_number: bpNumber.trim() || null,
        consumer_name: consumerName.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the flat");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (hasRecord) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSiteFlat(flat.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the flat");
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit flat" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Flat number" hint="e.g. B-1901">
          <input value={flatNumber} onChange={(e) => setFlatNumber(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Consumer name (optional)">
          <input value={consumerName} onChange={(e) => setConsumerName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="BP number (optional)">
          <input value={bpNumber} onChange={(e) => setBpNumber(e.target.value)} className={inputClass} />
        </Field>

        {hasRecord ? (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            This flat already has meter details. Remove the meter record before deleting the flat.
          </p>
        ) : null}

        {confirmDelete ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">
              Delete flat {flat.flat_number}? This cannot be undone.
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="danger" onClick={remove} disabled={busy} className="flex-1">
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <p className="rounded-xl bg-red-50 p-2.5 text-sm text-red-700">{error}</p> : null}

        <Button onClick={save} disabled={busy} className="w-full">
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {!confirmDelete ? (
          <Button
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            disabled={busy || hasRecord}
            className="w-full text-red-600"
          >
            Delete flat
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
