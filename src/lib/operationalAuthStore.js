import { pushAuthDiagnostic } from "./authDiagnostics";
import { normalizeOperationalRole as normalizePermissionRole } from "./permissions";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { buildCanonicalUrl } from "./siteUrl";

const OPERATIONAL_AUTH_UPDATED_EVENT = "tee-co-operational-auth-updated";

let authSubscription = null;
let initializationPromise = null;
let authSnapshot = {
  isLoading: isSupabaseConfigured,
  session: null,
  user: null,
  operationalUser: null,
  customerSession: null,
  actorType: "",
  error: "",
};

function emitOperationalAuthUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPERATIONAL_AUTH_UPDATED_EVENT));
}

function normalizeOperationalRole(user) {
  const metadataRole =
    user?.app_metadata?.operational_role ||
    user?.app_metadata?.role ||
    user?.user_metadata?.operational_role ||
    user?.user_metadata?.role;
  return normalizePermissionRole(metadataRole);
}

function buildOperationalDisplayName(user) {
  const metadataName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.app_metadata?.full_name ||
    user?.app_metadata?.name;

  if (metadataName) {
    return String(metadataName).trim();
  }

  if (user?.email) {
    return user.email;
  }

  return "Owner / Admin";
}

function buildCustomerDisplayName(user) {
  const metadataName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.app_metadata?.full_name ||
    user?.app_metadata?.name;

  if (metadataName) {
    return String(metadataName).trim();
  }

  if (user?.email) {
    return String(user.email).trim();
  }

  return "Customer Account";
}

function buildCustomerSession(user) {
  if (!user?.id) return null;
  if (normalizeOperationalRole(user)) return null;

  const firstName = String(user?.user_metadata?.first_name || "").trim();
  const lastName = String(user?.user_metadata?.last_name || "").trim();
  const phone = String(user?.user_metadata?.phone || "").trim();
  const displayName = buildCustomerDisplayName(user);

  return {
    id: user.id,
    firstName,
    lastName,
    email: user.email || "",
    phone,
    displayName,
    authMode: "supabase-session",
    isSupabaseAuthSession: true,
  };
}

function buildOperationalUser(user) {
  if (!user?.id) return null;
  const role = normalizeOperationalRole(user);
  if (!role) return null;

  return {
    id: user.id,
    name: buildOperationalDisplayName(user),
    role,
    email: user.email || "",
    authMode: "supabase-session",
    isSupabaseAuthSession: true,
  };
}

function applyOperationalSession(session, errorMessage = "") {
  const user = session?.user || null;
  const operationalUser = buildOperationalUser(user);
  const customerSession = buildCustomerSession(user);

  authSnapshot = {
    isLoading: false,
    session: session || null,
    user,
    operationalUser,
    customerSession,
    actorType: operationalUser ? "operational" : customerSession ? "customer" : "",
    error: errorMessage,
  };

  emitOperationalAuthUpdated();
}

function initializeAuthSubscription() {
  if (!isSupabaseConfigured || !supabase || authSubscription) return;

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    applyOperationalSession(session);
    pushAuthDiagnostic("supabase-auth-state-changed", {
      event,
      hasSession: Boolean(session),
      userId: session?.user?.id || "",
      resolvedRole: buildOperationalUser(session?.user)?.role || "",
    });
  });

  authSubscription = data.subscription;
}

export function getOperationalAuthSnapshot() {
  return authSnapshot;
}

export function getOperationalAuthUser() {
  return authSnapshot.operationalUser;
}

export function getAuthenticatedCustomerSession() {
  return authSnapshot.customerSession || null;
}

export function getAuthenticatedActorType() {
  return authSnapshot.actorType || "";
}

export function isOperationalAuthLoading() {
  return authSnapshot.isLoading;
}

export async function ensureOperationalAuthInitialized() {
  if (!isSupabaseConfigured || !supabase) {
    authSnapshot = {
      isLoading: false,
      session: null,
      user: null,
      operationalUser: null,
      customerSession: null,
      actorType: "",
      error: "",
    };
    return authSnapshot;
  }

  initializeAuthSubscription();

  if (!initializationPromise) {
    initializationPromise = supabase.auth
      .getSession()
      .then(({ data, error }) => {
        applyOperationalSession(data?.session || null, error?.message || "");
        pushAuthDiagnostic("supabase-session-hydrated", {
          hasSession: Boolean(data?.session),
          userId: data?.session?.user?.id || "",
          resolvedRole: buildOperationalUser(data?.session?.user)?.role || "",
          hadError: Boolean(error),
        });
        return authSnapshot;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        applyOperationalSession(null, message);
        pushAuthDiagnostic("supabase-session-hydrated", {
          hasSession: false,
          hadError: true,
          message,
        });
        return authSnapshot;
      });
  }

  return initializationPromise;
}

export async function signInToOperationalWorkspace({ email, password }) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      message: "Supabase authentication is not configured for this workspace.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || ""),
  });

  if (error) {
    pushAuthDiagnostic("supabase-login-failed", {
      message: error.message,
    });

    return {
      ok: false,
      message: error.message || "Unable to sign in.",
    };
  }

  applyOperationalSession(data?.session || null);

  const resolvedUser = data?.user || data?.session?.user;
  const operationalUser = buildOperationalUser(resolvedUser);
  const customerSession = buildCustomerSession(resolvedUser);

  pushAuthDiagnostic("supabase-login-succeeded", {
    userId: data?.user?.id || data?.session?.user?.id || "",
    resolvedRole: operationalUser?.role || "",
  });

  return {
    ok: true,
    session: data?.session || null,
    user: operationalUser,
    customerSession,
    actorType: operationalUser ? "operational" : customerSession ? "customer" : "",
  };
}

export async function signUpCustomerAccount({
  firstName,
  lastName,
  email,
  phone,
  password,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      message: "Supabase authentication is not configured for this workspace.",
    };
  }

  const normalizedFirstName = String(firstName || "").trim();
  const normalizedLastName = String(lastName || "").trim();
  const normalizedEmail = String(email || "").trim();
  const normalizedPhone = String(phone || "").trim();
  const displayName = [normalizedFirstName, normalizedLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const emailRedirectTo = buildCanonicalUrl("/login?emailConfirmed=1");

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: String(password || ""),
    options: {
      emailRedirectTo,
      data: {
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        phone: normalizedPhone,
        display_name: displayName,
        full_name: displayName,
      },
    },
  });

  if (error) {
    pushAuthDiagnostic("supabase-signup-failed", {
      message: error.message,
    });

    return {
      ok: false,
      message: error.message || "Unable to create account.",
    };
  }

  applyOperationalSession(data?.session || null);

  const resolvedUser = data?.user || data?.session?.user || null;
  const customerSession = buildCustomerSession(resolvedUser);

  pushAuthDiagnostic("supabase-signup-succeeded", {
    userId: resolvedUser?.id || "",
    hasSession: Boolean(data?.session),
  });

  return {
    ok: true,
    session: data?.session || null,
    user: resolvedUser,
    customerSession,
    requiresEmailConfirmation: Boolean(resolvedUser) && !data?.session,
  };
}

export async function requestCustomerPasswordReset(email) {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: "Supabase authentication is not configured for this workspace." };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(String(email || "").trim(), {
    redirectTo: buildCanonicalUrl("/login?passwordRecovery=1"),
  });

  return error
    ? { ok: false, message: error.message || "Unable to send the password reset email." }
    : { ok: true };
}

export async function updateCustomerPassword(password) {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: "Supabase authentication is not configured for this workspace." };
  }

  const { error } = await supabase.auth.updateUser({ password: String(password || "") });
  return error
    ? { ok: false, message: error.message || "Unable to update your password." }
    : { ok: true };
}

export async function signOutOperationalWorkspace() {
  if (!isSupabaseConfigured || !supabase) {
    applyOperationalSession(null);
    return { ok: true };
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    pushAuthDiagnostic("supabase-logout-failed", {
      message: error.message,
    });

    return {
      ok: false,
      message: error.message || "Unable to sign out.",
    };
  }

  applyOperationalSession(null);

  pushAuthDiagnostic("supabase-logout-succeeded", {});

  return { ok: true };
}

export function subscribeToOperationalAuth(listener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function notify() {
    listener(getOperationalAuthSnapshot());
  }

  function handleStorage() {
    void ensureOperationalAuthInitialized().then(notify);
  }

  window.addEventListener(OPERATIONAL_AUTH_UPDATED_EVENT, notify);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(OPERATIONAL_AUTH_UPDATED_EVENT, notify);
    window.removeEventListener("storage", handleStorage);
  };
}
