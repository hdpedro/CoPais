"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  recordSize as recordSizeService,
  updateSize as updateSizeService,
  deleteSize as deleteSizeService,
  isSizeKind,
} from "@/lib/services/child-sizes";

/**
 * Server actions pra tamanhos (Foundation Collab #7).
 * Wrappers finos sobre src/lib/services/child-sizes.ts.
 *
 * Cada action faz: auth + parse de FormData + delega pro service +
 * revalidate + redirect com query string de feedback.
 */

function buildRedirect(childId: string, params: Record<string, string>): string {
  const qs = new URLSearchParams({ tab: "tamanhos", ...params });
  return `/criancas/${childId}?${qs.toString()}#tamanhos`;
}

export async function recordChildSize(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const childId = (formData.get("childId") as string) || "";
  const groupId = (formData.get("groupId") as string) || "";
  const kindRaw = (formData.get("kind") as string) || "";
  const customLabel = (formData.get("customLabel") as string) || null;
  const sizeValue = (formData.get("sizeValue") as string) || "";
  const recordedOn = (formData.get("recordedOn") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const isConfirmation = formData.get("isConfirmation") === "1";

  if (!isSizeKind(kindRaw)) {
    redirect(buildRedirect(childId, { error: "Tipo de tamanho inválido." }));
  }

  const result = await recordSizeService(supabase, {
    groupId,
    childId,
    kind: kindRaw,
    customLabel,
    sizeValue,
    recordedOn,
    notes,
    isConfirmation,
    createdBy: user.id,
  });

  if (!result.ok) {
    redirect(buildRedirect(childId, { error: result.error }));
  }

  revalidatePath(`/criancas/${childId}`);
  revalidatePath("/dashboard");
  redirect(
    buildRedirect(childId, {
      success: isConfirmation ? "Tamanho confirmado." : "Tamanho registrado.",
    }),
  );
}

export async function updateChildSize(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sizeId = (formData.get("sizeId") as string) || "";
  const childId = (formData.get("childId") as string) || "";
  const sizeValue = (formData.get("sizeValue") as string) || undefined;
  const recordedOn = (formData.get("recordedOn") as string) || undefined;
  const notes = formData.has("notes") ? ((formData.get("notes") as string) || "") : undefined;
  const customLabel = formData.has("customLabel")
    ? ((formData.get("customLabel") as string) || "")
    : undefined;

  const result = await updateSizeService(supabase, {
    sizeId,
    actorId: user.id,
    patch: { sizeValue, recordedOn, notes, customLabel },
  });

  if (!result.ok) {
    redirect(buildRedirect(childId, { error: result.error }));
  }
  revalidatePath(`/criancas/${childId}`);
  redirect(buildRedirect(childId, { success: "Atualizado." }));
}

export async function deleteChildSize(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sizeId = (formData.get("sizeId") as string) || "";
  const childId = (formData.get("childId") as string) || "";

  const result = await deleteSizeService(supabase, { sizeId, actorId: user.id });
  if (!result.ok) {
    redirect(buildRedirect(childId, { error: result.error }));
  }
  revalidatePath(`/criancas/${childId}`);
  redirect(buildRedirect(childId, { success: "Removido." }));
}
