import { expect, test } from "@playwright/test";
import {
  isSupabaseAuthenticatedOwner,
  requiresSupabaseOwnerAuthorization,
} from "../src/admin/adminRoleView.js";

const policyPath = "/admin/settings/notifications/policy";

test("PIN-only Owner cannot authorize Notification Policy data access", () => {
  expect(requiresSupabaseOwnerAuthorization(policyPath)).toBe(true);
  expect(isSupabaseAuthenticatedOwner({
    id: "staff-owner-default",
    role: "Owner",
    authMode: "temporary-owner",
    isTemporaryOwnerSession: true,
  })).toBe(false);
  expect(isSupabaseAuthenticatedOwner({
    id: "staff-owner-default",
    role: "Owner",
  })).toBe(false);
});

test("Supabase-authenticated Owner can authorize Notification Policy access", () => {
  expect(isSupabaseAuthenticatedOwner({
    id: "owner-auth-user",
    role: "Owner",
    authMode: "supabase-session",
    isSupabaseAuthSession: true,
  })).toBe(true);
});

test("Supabase Staff and anonymous users remain blocked", () => {
  expect(isSupabaseAuthenticatedOwner({
    id: "staff-auth-user",
    role: "Staff",
    authMode: "supabase-session",
    isSupabaseAuthSession: true,
  })).toBe(false);
  expect(isSupabaseAuthenticatedOwner(null)).toBe(false);
  expect(isSupabaseAuthenticatedOwner({})).toBe(false);
});
