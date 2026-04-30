import { supabase, isSupabaseConfigured } from "./supabaseClient";
import {
  getStoredOrders,
  saveStoredOrders,
  createStoredOrder,
  updateStoredOrder,
  findStoredOrder,
} from "./ordersStore";

export async function fetchOrders() {
  if (!isSupabaseConfigured) {
    return getStoredOrders();
  }

  const { data, error } = await supabase.from("orders").select("*");

  if (error) {
    console.error("Supabase fetchOrders error", error);
    return [];
  }

  return data;
}

export async function createOrder(order) {
  if (!isSupabaseConfigured) {
    return createStoredOrder(order);
  }

  const { data, error } = await supabase
    .from("orders")
    .insert(order)
    .select()
    .single();

  if (error) {
    console.error("Supabase createOrder error", error);
    return null;
  }

  return data;
}

export async function updateOrder(orderNumber, updates) {
  if (!isSupabaseConfigured) {
    return updateStoredOrder(orderNumber, updates);
  }

  const { data, error } = await supabase
    .from("orders")
    .update(updates)
    .eq("order_number", orderNumber)
    .select()
    .single();

  if (error) {
    console.error("Supabase updateOrder error", error);
    return null;
  }

  return data;
}

export async function findOrder(orderNumber) {
  if (!isSupabaseConfigured) {
    return findStoredOrder(orderNumber);
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .single();

  if (error) {
    console.error("Supabase findOrder error", error);
    return null;
  }

  return data;
}
