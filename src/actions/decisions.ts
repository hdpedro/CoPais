"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createDecision as createDecisionService,
  castVote as castVoteService,
  addArgument as addArgumentService,
} from "@/lib/services/decisions";

export async function createDecision(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await createDecisionService(supabase, {
    groupId: formData.get("groupId") as string,
    createdBy: user.id,
    title: (formData.get("title") as string) || "",
    description: (formData.get("description") as string) || null,
    category: (formData.get("category") as string) || undefined,
    deadline: (formData.get("deadline") as string) || null,
  });

  if (!result.ok) {
    // Preserve original behavior: membership errors → /dashboard.
    const target = result.status === 403 ? "/dashboard" : "/decisoes";
    redirect(target + "?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/decisoes");
  revalidatePath("/chat");
  redirect("/decisoes");
}

export async function castVote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await castVoteService(supabase, {
    decisionId: formData.get("decisionId") as string,
    userId: user.id,
    vote: formData.get("vote") as "concordo" | "discordo" | "abstencao",
  });

  if (!result.ok) {
    const target = result.status === 403 ? "/dashboard" : "/decisoes";
    redirect(target + "?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/decisoes");
  revalidatePath("/chat");
  redirect("/decisoes");
}

export async function addArgument(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await addArgumentService(supabase, {
    decisionId: formData.get("decisionId") as string,
    userId: user.id,
    argumentType: (formData.get("argumentType") as string) || "",
    text: (formData.get("text") as string) || "",
  });

  if (!result.ok) {
    redirect("/decisoes?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/decisoes");
  redirect("/decisoes");
}
