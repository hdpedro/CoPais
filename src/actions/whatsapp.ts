"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  requestWhatsAppLinkService,
  verifyWhatsAppLinkService,
} from "@/lib/services/whatsapp-link";

/**
 * Step 1: Request WhatsApp linking — sends OTP via WhatsApp.
 * Caller fino: auth + delega ao service compartilhado (Regra 11).
 */
export async function requestWhatsAppLink(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const admin = createAdminClient();
  const result = await requestWhatsAppLinkService(
    admin,
    user.id,
    (formData.get("phone") as string) ?? "",
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/perfil");
  return { success: true, phone: result.phone };
}

/**
 * Step 2: Verify OTP and complete linking.
 * Caller fino: auth + delega ao service compartilhado (Regra 11).
 */
export async function verifyWhatsAppOTP(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const admin = createAdminClient();
  const result = await verifyWhatsAppLinkService(
    admin,
    user.id,
    (formData.get("otp") as string) ?? "",
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/perfil");
  return { success: true };
}

/**
 * Unlink WhatsApp from account
 */
export async function unlinkWhatsApp() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const admin = createAdminClient();

  // Soft-delete: deactivate instead of delete
  await admin
    .from("whatsapp_phone_links")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);

  // Clean up session
  await admin
    .from("whatsapp_sessions")
    .delete()
    .eq("user_id", user.id);

  revalidatePath("/perfil");
  return { success: true };
}

/**
 * Get current WhatsApp link status for the user
 */
export async function getWhatsAppLinkStatus() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: link } = await supabase
    .from("whatsapp_phone_links")
    .select("id, phone_number, verified_at, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("verified_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!link) return { status: "unlinked" as const };

  if (!link.verified_at) {
    return { status: "pending" as const, phone: link.phone_number };
  }

  return { status: "linked" as const, phone: link.phone_number };
}
