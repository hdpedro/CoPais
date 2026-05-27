/**
 * kindar/api-route-auth-helper — enforces consistent dual-auth em rotas API.
 *
 * Por que essa regra existe:
 *   Rotas em `src/app/api/**​/route.ts` PODEM ser chamadas tanto pelo PWA
 *   (cookie-based session) quanto pelo app native (Authorization: Bearer
 *   <jwt>). Se a rota usa SÓ `createClient()` (cookies SSR) + `supabase.auth.
 *   getUser()`, ela retorna 401 silencioso pra TODA chamada native — porque
 *   o native não envia cookies.
 *
 *   Esse foi o root cause de 2 bugs sistêmicos:
 *     - /api/push/register-apns (2026-05-26): zero APNs tokens em prod por
 *       ~48h até a descoberta. Fix em commit 28e9cca.
 *     - /api/native/notify (2026-05-27): TODOS os 7+ eventos criados via
 *       native nas últimas 2 semanas geraram ZERO notificações no inbox
 *       (5 users afetados). Fix em commit 7bfab65.
 *
 *   A regra trava o padrão pra que nenhuma rota futura volte a usar cookies-
 *   only sem opt-in explícito.
 *
 * O que a regra detecta:
 *   Em arquivos `src/app/api/**​/route.ts`:
 *     1. import de `createClient` from `@/lib/supabase/server` (cookies SSR)
 *     2. chamada `<algo>.auth.getUser()` no mesmo arquivo
 *   → erro.
 *
 * Solução sugerida:
 *   Substituir por `resolveAuthenticatedUser(req)` from `@/lib/api-auth`,
 *   que faz dual-auth (Bearer pro native, cookies pro PWA) em 1 linha.
 *
 * Opt-out:
 *   Rotas que SABIDAMENTE só rodam no PWA (Stripe checkout, AI context que
 *   precisa de session SSR completa, etc.) podem opt-out com comentário no
 *   topo do arquivo:
 *
 *     // kindar/api-route-auth-helper: pwa-only — <razão curta>
 *
 *   O comentário força explicitação da decisão (não pode ser esquecido) e
 *   documenta na própria rota o motivo do bypass. Audit trail no git blame.
 *
 * Auto-fix:
 *   Não implementado. A refatoração envolve trocar import + entrypoint +
 *   possivelmente queries pós-auth pra admin client. Manual + revisão.
 */

const OPT_OUT_COMMENT_PREFIX = "kindar/api-route-auth-helper: pwa-only";

function fileIsApiRoute(filename) {
  // Windows usa \, Unix /. Normalizamos.
  const normalized = filename.replace(/\\/g, "/");
  return (
    normalized.includes("/src/app/api/") &&
    /\/route\.(ts|tsx|js|mjs)$/.test(normalized)
  );
}

function fileHasOptOut(sourceCode) {
  // Procura o comentário em qualquer linha (não só topo) pra ser permissivo.
  const allComments = sourceCode.getAllComments();
  return allComments.some((c) => c.value.trim().startsWith(OPT_OUT_COMMENT_PREFIX));
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "API routes em src/app/api/**​/route.ts devem usar resolveAuthenticatedUser pra suportar Bearer (native) + cookies (PWA).",
      recommended: true,
    },
    schema: [],
    messages: {
      cookieOnlyAuth:
        "Rota API usa createClient() (cookies SSR) + auth.getUser(). Native callers (que enviam Authorization: Bearer) recebem 401 silencioso. Use `resolveAuthenticatedUser(req)` from `@/lib/api-auth`. Opt-out PWA-only: adicione comentário `// kindar/api-route-auth-helper: pwa-only — <razão>`.",
    },
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    if (!fileIsApiRoute(filename)) return {};

    const sourceCode = context.sourceCode || context.getSourceCode();
    if (fileHasOptOut(sourceCode)) return {};

    let importsCookieClient = false;
    let getUserCalls = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "@/lib/supabase/server") return;
        const named = node.specifiers.find(
          (s) =>
            s.type === "ImportSpecifier" && s.imported?.name === "createClient",
        );
        if (named) importsCookieClient = true;
      },
      // Casa <qualquer>.auth.getUser() — supabase.auth.getUser(), client.auth.
      // getUser(), supabaseClient.auth.getUser(), etc.
      "CallExpression > MemberExpression[property.name='getUser']"(node) {
        const parent = node.object;
        if (
          parent &&
          parent.type === "MemberExpression" &&
          parent.property?.name === "auth"
        ) {
          getUserCalls.push(node);
        }
      },
      "Program:exit"() {
        if (importsCookieClient && getUserCalls.length > 0) {
          for (const node of getUserCalls) {
            context.report({ node, messageId: "cookieOnlyAuth" });
          }
        }
      },
    };
  },
};
