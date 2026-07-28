#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const VALID_ROLES = new Set(["owner", "manager", "staff"]);

function parseArguments(argv) {
  const options = {
    email: "",
    role: "",
    clearOperationalRole: false,
    execute: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--execute") {
      options.execute = true;
      continue;
    }

    if (argument === "--clear-operational-role") {
      options.clearOperationalRole = true;
      continue;
    }

    if (argument === "--email" || argument === "--role") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }

      options[argument.slice(2)] = value.trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  options.email = options.email.toLowerCase();
  options.role = options.role.toLowerCase();

  if (!options.email) {
    throw new Error("--email is required.");
  }
  if (options.role && options.clearOperationalRole) {
    throw new Error(
      "--role and --clear-operational-role are mutually exclusive."
    );
  }
  if (!options.role && !options.clearOperationalRole) {
    throw new Error("--role or --clear-operational-role is required.");
  }
  if (options.role && !VALID_ROLES.has(options.role)) {
    throw new Error(
      `Invalid role "${options.role}". Expected one of: owner, manager, staff.`
    );
  }
  if (!options.execute) {
    throw new Error(
      "Refusing to modify Auth metadata without --execute. " +
      "Run: node scripts/provision-operational-user.mjs " +
      `--email ${options.email} ${
        options.clearOperationalRole
          ? "--clear-operational-role"
          : `--role ${options.role}`
      } --execute`
    );
  }

  return options;
}

async function loadDotEnv(filePath = ".env") {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 0) return;

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && !Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function createAdminClient() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function findAuthUserByEmail(client, email) {
  const normalizedEmail = email.trim().toLowerCase();
  const matches = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];
    matches.push(
      ...users.filter(
        (user) => String(user.email || "").trim().toLowerCase() === normalizedEmail
      )
    );

    if (users.length < PAGE_SIZE) break;
  }

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one Auth user for ${email}; found ${matches.length}.`
    );
  }

  return matches[0];
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  await loadDotEnv();
  const client = createAdminClient();
  const user = await findAuthUserByEmail(client, options.email);
  const beforeMetadata = { ...(user.app_metadata || {}) };
  const afterMetadata = { ...beforeMetadata };
  if (options.clearOperationalRole) {
    delete afterMetadata.operational_role;
  } else {
    afterMetadata.operational_role = options.role;
  }
  const metadataUpdate = options.clearOperationalRole
    ? { ...afterMetadata, operational_role: null }
    : afterMetadata;

  console.log("Operational user provisioning — before update");
  console.log("Email:", options.email);
  console.log("Auth user ID:", user.id);
  console.log(
    options.clearOperationalRole
      ? "Requested action: clear operational role"
      : `Requested operational role: ${options.role}`
  );
  console.log("Current app_metadata:");
  console.log(JSON.stringify(beforeMetadata, null, 2));
  console.log("Proposed app_metadata:");
  console.log(JSON.stringify(afterMetadata, null, 2));

  const { error: updateError } = await client.auth.admin.updateUserById(
    user.id,
    { app_metadata: metadataUpdate }
  );
  if (updateError) throw updateError;

  const { data: readBackData, error: readBackError } =
    await client.auth.admin.getUserById(user.id);
  if (readBackError) throw readBackError;

  const verifiedUser = readBackData?.user;
  if (!verifiedUser || verifiedUser.id !== user.id) {
    throw new Error("Auth user read-back did not return the updated user.");
  }

  const verifiedMetadata = { ...(verifiedUser.app_metadata || {}) };
  if (
    options.clearOperationalRole &&
    Object.prototype.hasOwnProperty.call(
      verifiedMetadata,
      "operational_role"
    )
  ) {
    throw new Error(
      "Verification failed: operational_role is still present."
    );
  }
  if (
    !options.clearOperationalRole &&
    verifiedMetadata.operational_role !== options.role
  ) {
    throw new Error(
      `Verification failed: operational_role was not written as ${options.role}.`
    );
  }
  const expectedVerifiedMetadata = { ...beforeMetadata };
  if (options.clearOperationalRole) {
    delete expectedVerifiedMetadata.operational_role;
  } else {
    expectedVerifiedMetadata.operational_role = options.role;
  }
  if (stableJson(verifiedMetadata) !== stableJson(expectedVerifiedMetadata)) {
    throw new Error(
      "Verification failed: app_metadata fields other than operational_role changed."
    );
  }

  console.log("Operational user provisioning — verified after update");
  console.log("Email:", options.email);
  console.log("Auth user ID:", verifiedUser.id);
  console.log(
    "Operational role:",
    options.clearOperationalRole
      ? "absent"
      : verifiedMetadata.operational_role
  );
  console.log("Verified app_metadata:");
  console.log(JSON.stringify(verifiedMetadata, null, 2));
  console.log(
    options.clearOperationalRole
      ? "Verified operational_role is absent; all other app_metadata fields were preserved."
      : `Verified operational_role=${options.role}; all other app_metadata fields were preserved.`
  );
}

main().catch((error) => {
  console.error("Operational user provisioning failed:", error?.message || error);
  process.exitCode = 1;
});
