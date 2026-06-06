import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // `prototipo` é uma rota de protótipo visual sem auth/Supabase — pula
    // o middleware pra não exigir env vars quando estiver rodando isolado.
    // `baixar` é o smart link público (bio do Instagram): redireciona logo
    // p/ a loja por aparelho; pular o middleware evita o bounce de usuário
    // deslogado p/ /session-recovery e deixa o redirect rápido (sem getUser).
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|prototipo|baixar|icon-.*\\.png|apple-touch-icon\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
