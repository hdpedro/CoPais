"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const convite = formData.get("convite") as string | null;

  // If user has an invite token, include it in the callback URL
  const callbackUrl = new URL("/auth/callback", process.env.NEXT_PUBLIC_APP_URL);
  if (convite) {
    callbackUrl.searchParams.set("next", `/convite/${convite}`);
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/verify-email");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const convite = formData.get("convite") as string | null;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Don't call revalidatePath here — it triggers concurrent revalidation of
  // all pages/layouts, causing Supabase token refresh race conditions.
  // The redirect below will load fresh data anyway.

  // If user has an invite token, redirect to accept it
  if (convite) {
    redirect(`/convite/${convite}`);
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;

  // Use dedicated redirect URL so the callback knows this is a recovery flow.
  // Supabase appends code/token_hash params to this URL.
  const redirectUrl = new URL("/auth/callback", process.env.NEXT_PUBLIC_APP_URL);
  redirectUrl.searchParams.set("next", "/reset-password");
  redirectUrl.searchParams.set("type", "recovery");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl.toString(),
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "E-mail de recuperação enviado!" };
}

export async function signInWithOAuth(provider: "google" | "apple" | "facebook", redirectPath?: string) {
  const supabase = await createClient();

  const callbackUrl = new URL("/auth/callback", process.env.NEXT_PUBLIC_APP_URL);
  if (redirectPath) {
    callbackUrl.searchParams.set("next", redirectPath);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }

  return { error: "Erro ao iniciar login social." };
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();

  const password = formData.get("password") as string;

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}
