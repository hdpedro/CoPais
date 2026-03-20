"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function createDocument(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const childId = formData.get("childId") as string;
  const category = formData.get("category") as string;
  const name = formData.get("name") as string;
  const file = formData.get("file") as File;

  if (!file || file.size === 0) redirect("/documentos?error=" + encodeURIComponent("Selecione um arquivo"));

  // Limit file size to 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) redirect("/documentos?error=" + encodeURIComponent("Arquivo muito grande. Maximo 10MB."));

  // Verify user belongs to this group
  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .single();

  if (!membership) redirect("/documentos?error=" + encodeURIComponent("Sem permissao"));

  // Verify child belongs to group
  if (childId) {
    const { data: child } = await supabase.from("children").select("id").eq("id", childId).eq("group_id", groupId).single();
    if (!child) redirect("/documentos?error=" + encodeURIComponent("Crianca nao pertence a este grupo."));
  }

  // Use service role to bypass storage RLS policies
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Upload to Supabase Storage
  const fileName = `${groupId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await adminClient.storage
    .from("documents")
    .upload(fileName, file);

  if (uploadError) redirect("/documentos?error=" + encodeURIComponent(uploadError.message));

  const { data: urlData } = adminClient.storage
    .from("documents")
    .getPublicUrl(fileName);

  const { error } = await supabase.from("documents").insert({
    group_id: groupId,
    child_id: childId || null,
    category,
    name,
    file_url: urlData.publicUrl,
    file_size: file.size,
    mime_type: file.type,
    uploaded_by: user.id,
  });

  if (error) redirect("/documentos?error=" + encodeURIComponent(error.message));
  redirect("/documentos");
}
