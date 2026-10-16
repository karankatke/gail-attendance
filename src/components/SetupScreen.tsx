export function SetupScreen() {
  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-bold text-slate-900">Connect your Supabase project</h1>
        <p className="mt-2 text-sm text-slate-600">
          This app needs your Supabase URL and key before it can run. One-time setup:
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>
            Create a free project at <span className="font-mono">supabase.com</span>.
          </li>
          <li>
            Open <span className="font-semibold">SQL Editor</span> and apply the schema (tables,
            policies, report functions), then seed the owner and supervisor profiles.
          </li>
          <li>
            Deploy the <span className="font-mono">enroll</span> Edge Function (used to create
            supervisor logins on first use).
          </li>
          <li>
            Copy <span className="font-mono">.env.example</span> to{" "}
            <span className="font-mono">.env.local</span> and fill in the URL and anon key.
          </li>
          <li>Restart the dev server (or redeploy).</li>
        </ol>
        <p className="mt-4 rounded-xl bg-brand-50 p-3 text-xs text-brand-800">
          Full step-by-step instructions are in <span className="font-semibold">README.md</span>.
        </p>
      </div>
    </div>
  );
}
