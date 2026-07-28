import { expect, test } from "@playwright/test";
import {
  getSupabaseRouteAuthorizationRequirement,
  isSupabaseAuthenticatedOperationalUser,
  isSupabaseAuthenticatedOwner,
  requiresSupabaseOperationalAuthorization,
  requiresSupabaseOwnerAuthorization,
} from "../src/admin/adminRoleView.js";

const policyPath = "/admin/settings/notifications/policy";
const templatesPath = "/admin/settings/notifications";
const activityPath = "/admin/settings/notifications/activity";

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

test("Templates and Policy require Owner while Activity matches operational-user RLS", () => {
  const supabaseStaff = {
    id: "staff-auth-user",
    role: "Staff",
    authMode: "supabase-session",
    isSupabaseAuthSession: true,
  };

  expect(getSupabaseRouteAuthorizationRequirement(templatesPath)).toBe("owner");
  expect(getSupabaseRouteAuthorizationRequirement(policyPath)).toBe("owner");
  expect(requiresSupabaseOwnerAuthorization(activityPath)).toBe(false);
  expect(requiresSupabaseOperationalAuthorization(activityPath)).toBe(true);
  expect(getSupabaseRouteAuthorizationRequirement(activityPath)).toBe("operational");
  expect(isSupabaseAuthenticatedOperationalUser(supabaseStaff)).toBe(true);
  expect(isSupabaseAuthenticatedOwner(supabaseStaff)).toBe(false);
});

test("normal admin routes retain PIN authorization and no Supabase handoff", () => {
  expect(getSupabaseRouteAuthorizationRequirement("/admin")).toBe("");
  expect(getSupabaseRouteAuthorizationRequirement("/admin/orders")).toBe("");
});
