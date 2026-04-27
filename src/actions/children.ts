"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { captureServerEvent } from "@/lib/posthog-server";

export async function upsertChildEducation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const childId = formData.get("childId") as string;
  const groupId = formData.get("groupId") as string;

  // Verify group membership
  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup || activeGroup.groupId !== groupId) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  // Verify child belongs to group
  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("group_id", groupId)
    .single();

  if (!child) {
    redirect("/criancas?error=" + encodeURIComponent("Crianca nao encontrada."));
  }

  const schoolName = formData.get("school_name") as string;
  const schoolAddress = formData.get("school_address") as string;
  const schoolPhone = formData.get("school_phone") as string;
  const grade = formData.get("grade") as string;
  const className = formData.get("class_name") as string;
  const teacherName = formData.get("teacher_name") as string;
  const coordinatorName = formData.get("coordinator_name") as string;
  const entryTime = formData.get("entry_time") as string;
  const exitTime = formData.get("exit_time") as string;
  const extracurricularRaw = formData.get("extracurricular_activities") as string;
  const extracurricularActivities = extracurricularRaw
    ? extracurricularRaw.split(",").map((a) => a.trim()).filter(Boolean)
    : [];

  const payload = {
    child_id: childId,
    group_id: groupId,
    school_name: schoolName || null,
    school_address: schoolAddress || null,
    school_phone: schoolPhone || null,
    grade: grade || null,
    class_name: className || null,
    teacher_name: teacherName || null,
    coordinator_name: coordinatorName || null,
    entry_time: entryTime || null,
    exit_time: exitTime || null,
    extracurricular_activities: extracurricularActivities.length > 0 ? extracurricularActivities : null,
  };

  // Check if education record already exists
  const { data: existing } = await supabase
    .from("child_education")
    .select("id")
    .eq("child_id", childId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("child_education")
      .update(payload)
      .eq("id", existing.id);

    if (error) {
      redirect("/criancas/" + childId + "?tab=educacao&error=" + encodeURIComponent(error.message));
    }
  } else {
    const { error } = await supabase
      .from("child_education")
      .insert(payload);

    if (error) {
      redirect("/criancas/" + childId + "?tab=educacao&error=" + encodeURIComponent(error.message));
    }
  }

  captureServerEvent(user.id, "child_education_updated");

  revalidatePath("/criancas/" + childId);
  redirect("/criancas/" + childId + "?tab=educacao");
}

export async function uploadChildDocument(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const childId = formData.get("childId") as string;
  const category = formData.get("category") as string;
  const name = formData.get("name") as string;
  const file = formData.get("file") as File;

  if (!file || file.size === 0) {
    redirect("/criancas/" + childId + "?tab=documentos&error=" + encodeURIComponent("Selecione um arquivo"));
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    redirect("/criancas/" + childId + "?tab=documentos&error=" + encodeURIComponent("Arquivo muito grande. Maximo 10MB."));
  }

  // Validate file MIME type
  const ALLOWED_DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!ALLOWED_DOC_TYPES.includes(file.type)) {
    redirect("/criancas/" + childId + "?tab=documentos&error=" + encodeURIComponent("Tipo de arquivo não permitido."));
  }

  // Verify membership
  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup || activeGroup.groupId !== groupId) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao."));
  }

  // Use service role for storage
  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Sanitize filename: remove accents and characters Supabase Storage rejects
  // Keeps only a-z, A-Z, 0-9, dot, dash, underscore
  const sanitizedFileName = file.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (acentos)
    .replace(/[^a-zA-Z0-9._-]/g, "_") // replace other special chars with _
    .replace(/_+/g, "_") // collapse multiple underscores
    .replace(/^_+|_+$/g, ""); // trim leading/trailing underscores

  const safeName = sanitizedFileName || "document";
  const fileName = `${groupId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await adminClient.storage
    .from("documents")
    .upload(fileName, file);

  if (uploadError) {
    redirect("/criancas/" + childId + "?tab=documentos&error=" + encodeURIComponent(uploadError.message));
  }

  // After migration 062: store the storage path only. Reads sign URLs at
  // render time via getSignedFileUrl(). getPublicUrl() would return a 404
  // since buckets are private.
  const { error } = await supabase.from("documents").insert({
    group_id: groupId,
    child_id: childId,
    category,
    name,
    file_url: fileName,
    file_size: file.size,
    mime_type: file.type,
    uploaded_by: user.id,
  });

  if (error) {
    redirect("/criancas/" + childId + "?tab=documentos&error=" + encodeURIComponent(error.message));
  }

  captureServerEvent(user.id, "child_document_uploaded");

  revalidatePath("/criancas/" + childId);
  redirect("/criancas/" + childId + "?tab=documentos&success=" + encodeURIComponent("Documento enviado com sucesso."));
}

export async function deleteChildDocument(documentId: string, childId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify the document exists and user has access
  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_url, group_id")
    .eq("id", documentId)
    .single();

  if (!doc) return { error: "Documento não encontrado." };

  // Verify user belongs to the group
  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup || activeGroup.groupId !== doc.group_id) {
    return { error: "Sem permissão." };
  }

  // Use admin client to bypass RLS for both storage and DB deletion
  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Delete file from storage. After migration 062, file_url is path-only
  // ("groupId/timestamp-name"). Pre-migration rows may still have absolute
  // URLs — extract the path portion in that case.
  try {
    const stored = doc.file_url || "";
    let storagePath = stored;
    if (stored.startsWith("http")) {
      const url = new URL(stored);
      const parts = url.pathname.split("/storage/v1/object/public/documents/");
      if (parts[1]) storagePath = decodeURIComponent(parts[1]);
    }
    if (storagePath) {
      await adminClient.storage.from("documents").remove([storagePath]);
    }
  } catch {
    // Storage deletion failed — continue with DB deletion anyway
  }

  // Delete from database (admin client to bypass RLS)
  const { error } = await adminClient
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (error) return { error: error.message };

  captureServerEvent(user.id, "child_document_deleted");

  revalidatePath("/criancas/" + childId);
  revalidatePath("/documentos");
  return { success: true };
}
