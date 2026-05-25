import { createClient } from "@supabase/supabase-js";

const viteEnv = typeof import.meta !== "undefined" && import.meta?.env ? import.meta.env : {};

const supabaseUrl = viteEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY;
const supabasePublishableKeyFromEnv = viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabasePublishableKey =
  supabasePublishableKeyFromEnv || supabaseAnonKey;

const resolvedPublishableKeySource = supabasePublishableKeyFromEnv
  ? "VITE_SUPABASE_PUBLISHABLE_KEY"
  : supabaseAnonKey
    ? "VITE_SUPABASE_ANON_KEY"
    : "missing";

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey
);

export const supabaseConfig = {
  url: supabaseUrl || "",
  publishableKey: supabasePublishableKey || "",
};

export const supabaseDiagnostics = {
  hasSupabaseUrlEnvVar: Boolean(supabaseUrl),
  hasSupabasePublishableKeyEnvVar: Boolean(supabasePublishableKeyFromEnv),
  hasSupabaseAnonKeyEnvVar: Boolean(supabaseAnonKey),
  resolvedPublishableKeySource,
  isCodespacesHost:
    typeof window !== "undefined"
      ? window.location.hostname.endsWith(".app.github.dev")
      : false,
  hostname: typeof window !== "undefined" ? window.location.hostname : "",
};

console.log("[supabaseClient] Supabase env evaluation", {
  ...supabaseDiagnostics,
  isSupabaseConfigured,
});

let supabaseClient = null;
let supabaseInitializationError = null;

if (!isSupabaseConfigured) {
  console.warn("[supabaseClient] Supabase client not initialized because required Vite env vars are missing", {
    hasSupabaseUrlEnvVar: supabaseDiagnostics.hasSupabaseUrlEnvVar,
    hasSupabasePublishableKeyEnvVar: supabaseDiagnostics.hasSupabasePublishableKeyEnvVar,
    hasSupabaseAnonKeyEnvVar: supabaseDiagnostics.hasSupabaseAnonKeyEnvVar,
    resolvedPublishableKeySource,
    isCodespacesHost: supabaseDiagnostics.isCodespacesHost,
    hostname: supabaseDiagnostics.hostname,
  });
} else {
  try {
    supabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "tee-co-supabase-auth",
      },
    });
  } catch (error) {
    supabaseInitializationError = error;
    console.error("[supabaseClient] Supabase client initialization threw", {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
    });
  }
}

console.log("[supabaseClient] Supabase client initialization result", {
  initialized: Boolean(supabaseClient),
  isSupabaseConfigured,
  hadInitializationError: Boolean(supabaseInitializationError),
});

export { supabaseInitializationError };
export const supabase = supabaseClient;
