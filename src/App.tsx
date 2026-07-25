import { isSupabaseConfigured } from "./platform/supabase/client";

function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
          JDS Platform
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Platform application shell
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
          The React, Vite, TypeScript, Supabase, Tailwind, linting, and test infrastructure is
          ready. Domain modules remain preserved and are not mounted in this shell yet.
        </p>
        <div className="mt-8 w-fit rounded-md border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300">
          Supabase:{" "}
          <span className={isSupabaseConfigured ? "text-emerald-300" : "text-amber-300"}>
            {isSupabaseConfigured ? "configured" : "waiting for environment variables"}
          </span>
        </div>
      </section>
    </main>
  );
}

export default App;
