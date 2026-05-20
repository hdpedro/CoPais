import VerifyEmailClient from "./VerifyEmailClient";

/**
 * Server entry pra /verify-email. Lê o email da query (setado pelo
 * `signUp` action via `redirect("/verify-email?email=...")`) e passa pro
 * componente client que faz polling + UX realtime.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string; resent?: string }>;
}) {
  const sp = await searchParams;
  return (
    <VerifyEmailClient
      initialEmail={sp.email ?? ""}
      initialError={sp.error ?? null}
      initialResent={sp.resent === "1"}
    />
  );
}
