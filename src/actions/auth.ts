"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { captureServerEvent } from "@/lib/posthog-server";
import { sendWelcomeEmail } from "@/lib/emails/welcome";

// Translate common Supabase auth errors to Portuguese
function translateAuthError(message: string): string {
  const translations: Record<string, string> = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "E-mail ainda não confirmado. Verifique sua caixa de entrada.",
    "User already registered": "Este e-mail já está cadastrado.",
    "Password should be at least 6 characters": "A senha deve ter pelo menos 6 caracteres.",
    "New password should be different from the old password.": "A nova senha deve ser diferente da senha atual.",
    "Auth session missing!": "Sessão expirada. Faça login novamente.",
    "User not found": "Usuário não encontrado.",
    "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos.",
    "For security purposes, you can only request this once every 60 seconds": "Por segurança, aguarde 60 segundos entre tentativas.",
  };
  return translations[message] || message;
}

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
    return { error: translateAuthError(error.message) };
  }

  captureServerEvent(email, "user_signup", { has_invite: !!convite });

  // Fire-and-forget welcome email
  void sendWelcomeEmail(email, fullName);

  redirect("/verify-email");
}

export async function signIn(formData: FormData) {
  const rememberMe = formData.get("rememberMe") === "on";

  // Store preference so Supabase cookie handlers can read it
  const cookieStore = await cookies();
  cookieStore.set("remember_me", rememberMe ? "true" : "false", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: rememberMe ? 60 * 60 * 24 * 30 : 0, // 30 days if checked, session if not
  });

  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const convite = formData.get("convite") as string | null;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  // Set long-lived flag so middleware knows user had a valid session.
  // This survives Safari ITP cookie clearing and enables client-side recovery.
  cookieStore.set("kindar-has-session", "1", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  captureServerEvent(email, "user_login", { has_invite: !!convite });

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

  // Clear remember_me and session flag cookies
  const cookieStore = await cookies();
  cookieStore.set("remember_me", "", { maxAge: 0, path: "/" });
  cookieStore.set("kindar-has-session", "", { maxAge: 0, path: "/" });

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
    return { error: translateAuthError(error.message) };
  }

  captureServerEvent(email, "password_reset");

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
    return { error: translateAuthError(error.message) };
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
    return { error: translateAuthError(error.message) };
  }

  redirect("/dashboard");
}
