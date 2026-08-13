import { supabase } from "../lib/supabaseClient";

const DEFAULT_ENDPOINT = "/.netlify/functions/square-terminal-device";

async function getAccessToken() {
  if (!supabase) throw new Error("Supabase authentication is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) {
    throw new Error("An authenticated owner session is required.");
  }
  return data.session.access_token;
}
async function requestTerminalDevice(method, body, options = {}) {
  const accessToken = options.accessToken || await getAccessToken();
  const response = await (options.fetcher || fetch)(options.endpoint || DEFAULT_ENDPOINT, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to manage Square Terminal pairing.");
  return data.registration || null;
}

export function getSquareTerminalPairingStatus(options = {}) {
  return requestTerminalDevice("GET", null, options);
}

export function createSquareTerminalPairingCode(deviceName, options = {}) {
  return requestTerminalDevice("POST", { deviceName }, options);
}
