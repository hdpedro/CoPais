import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // `prototipo` é uma rota de protótipo visual sem auth/Supabase — pula
    // o middleware pra não exigir env vars quando estiver rodando isolado.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|prototipo|icon-.*\\.png|apple-touch-icon\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
