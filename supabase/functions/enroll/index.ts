import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function padPin(pin: string): string {
  return pin.padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const { profile_id, pin } = await req.json().catch(() => ({}) as {
      profile_id?: string;
      pin?: string;
    });

    if (!profile_id || typeof profile_id !== "string") {
      return json({ ok: false, error: "Missing profile_id" }, 400);
    }
    if (!pin || typeof pin !== "string" || pin.length < 4) {
      return json({ ok: false, error: "PIN must be at least 4 digits" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("id, role, status, user_id, login_email")
      .eq("id", profile_id)
      .maybeSingle();

    if (pErr) return json({ ok: false, error: pErr.message }, 500);
    if (!profile) return json({ ok: false, error: "Profile not found" }, 404);
    if (profile.role !== "supervisor") {
      return json({ ok: false, error: "Only supervisors can enroll here" }, 403);
    }
    if (profile.status !== "approved" || profile.user_id) {
      return json({ ok: false, error: "This profile is not ready for enrollment" }, 409);
    }

    const email = profile.login_email as string;
    const password = padPin(pin);

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let userId = created?.user?.id ?? null;
    if (cErr) {
      const msg = (cErr.message || "").toLowerCase();
      if (!msg.includes("already") && !msg.includes("registered") && !msg.includes("exists")) {
        return json({ ok: false, error: cErr.message }, 400);
      }
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
      );
      if (!existing) return json({ ok: false, error: cErr.message }, 400);
      userId = existing.id;
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    }

    if (!userId) return json({ ok: false, error: "Could not create user" }, 500);

    const { error: uErr } = await admin
      .from("profiles")
      .update({ user_id: userId, status: "active", approved_at: new Date().toISOString() })
      .eq("id", profile_id);
    if (uErr) return json({ ok: false, error: uErr.message }, 500);

    return json({ ok: true, email });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
