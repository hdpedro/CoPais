"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";

export async function createDecision(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const category = formData.get("category") as string;
  const deadline = formData.get("deadline") as string;

  if (!title) {
    redirect("/decisoes?error=" + encodeURIComponent("Titulo obrigatorio."));
  }

  const { error } = await supabase.from("decisions").insert({
    group_id: groupId,
    title,
    description: description || null,
    category,
    deadline: deadline || null,
    created_by: user.id,
  });

  if (error) redirect("/decisoes?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "decision_created", { category });

  // Send push notification to other group members
  try {
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .neq("user_id", user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const creatorName = profile?.full_name?.split(" ")[0] || "Alguem";

    if (members) {
      await Promise.all(
        members.map((member) =>
          createNotificationWithPush(
            member.user_id,
            "decision_created",
            "Nova Decisao",
            `${creatorName} criou: ${title}`,
            "/decisoes"
          ).catch(() => {/* individual notification failure is non-critical */})
        )
      );
    }
  } catch {
    // Push failure shouldn't block
  }

  // Post chat notification
  try {
    await postChatNotification(supabase, groupId, user.id, `🗳️ Nova decisao: ${title}`);
  } catch {
    // Notification failure should not break the action
  }

  revalidatePath("/decisoes");
  revalidatePath("/chat");
  redirect("/decisoes");
}

export async function castVote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const decisionId = formData.get("decisionId") as string;
  const vote = formData.get("vote") as string;

  if (!decisionId?.trim()) {
    redirect("/decisoes?error=" + encodeURIComponent("ID da decisao obrigatorio."));
  }

  const validVotes = ["concordo", "discordo", "abstencao"];
  if (!validVotes.includes(vote)) {
    redirect("/decisoes?error=" + encodeURIComponent("Voto invalido."));
  }

  // Fetch the decision to verify group membership
  const { data: decision } = await supabase
    .from("decisions")
    .select("id, group_id, title, status, created_by")
    .eq("id", decisionId)
    .single();

  if (!decision) {
    redirect("/decisoes?error=" + encodeURIComponent("Decisao nao encontrada."));
  }

  if (decision.status !== "aberta") {
    redirect("/decisoes?error=" + encodeURIComponent("Esta decisao ja foi resolvida."));
  }

  const membership = await verifyGroupMembership(supabase, decision.group_id, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  // Upsert vote (ON CONFLICT decision_id, user_id DO UPDATE)
  const { error } = await supabase
    .from("decision_votes")
    .upsert(
      {
        decision_id: decisionId,
        user_id: user.id,
        vote,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "decision_id,user_id" }
    );

  if (error) redirect("/decisoes?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "decision_vote_cast", { vote });

  // Check resolution: get all group members and all votes
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", decision.group_id);

  const { data: votes } = await supabase
    .from("decision_votes")
    .select("user_id, vote")
    .eq("decision_id", decisionId);

  if (members && votes) {
    const hasDiscordo = votes.some((v) => v.vote === "discordo");
    const allVoted = members.every((m) =>
      votes.some((v) => v.user_id === m.user_id)
    );
    const allConcordo = allVoted && votes.every((v) => v.vote === "concordo");

    let newStatus: string | null = null;

    if (hasDiscordo) {
      newStatus = "rejeitada";
    } else if (allConcordo) {
      newStatus = "aprovada";
    }

    if (newStatus) {
      await supabase
        .from("decisions")
        .update({ status: newStatus, resolved_at: new Date().toISOString() })
        .eq("id", decisionId);

      // Chat notification on resolution
      try {
        const chatMsg = newStatus === "aprovada"
          ? `✅ Decisao aprovada: ${decision.title}`
          : `❌ Decisao rejeitada: ${decision.title}`;
        await postChatNotification(supabase, decision.group_id, user.id, chatMsg);
      } catch {
        // Notification failure should not break the action
      }

      // Push notification to creator
      try {
        if (decision.created_by !== user.id) {
          await createNotificationWithPush(
            decision.created_by,
            "decision_resolved",
            newStatus === "aprovada" ? "Decisao Aprovada" : "Decisao Rejeitada",
            newStatus === "aprovada"
              ? `Sua decisao "${decision.title}" foi aprovada`
              : `Sua decisao "${decision.title}" foi rejeitada`,
            "/decisoes"
          );
        }
      } catch {
        // Push failure shouldn't block
      }
    }
  }

  revalidatePath("/decisoes");
  revalidatePath("/chat");
  redirect("/decisoes");
}

export async function addArgument(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const decisionId = formData.get("decisionId") as string;
  const argumentType = formData.get("argumentType") as string;
  const text = (formData.get("text") as string)?.trim();

  if (!text) {
    redirect("/decisoes?error=" + encodeURIComponent("Texto do argumento obrigatorio."));
  }

  // Fetch the decision to verify group membership
  const { data: decision } = await supabase
    .from("decisions")
    .select("group_id")
    .eq("id", decisionId)
    .single();

  if (!decision) {
    redirect("/decisoes?error=" + encodeURIComponent("Decisao nao encontrada."));
  }

  const membership = await verifyGroupMembership(supabase, decision.group_id, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const { error } = await supabase.from("decision_arguments").insert({
    decision_id: decisionId,
    user_id: user.id,
    argument_type: argumentType,
    text,
  });

  if (error) redirect("/decisoes?error=" + encodeURIComponent(error.message));

  revalidatePath("/decisoes");
  redirect("/decisoes");
}
