"use client";

/**
 * Client-side wrapper que faz o `dynamic({ ssr: false })` import de
 * ChatRoom. Necessário porque Next.js 16+ proíbe `ssr: false` direto em
 * Server Components (build error). Esta wrapper isola a chamada `dynamic`
 * num escopo "use client", o que satisfaz o constraint.
 *
 * Bug F#61 (E2E PRD 2026-05-25): ChatRoom renderiza datas via `new Date()`
 * em getDateLabel/getDateKey/generateMonthOptions, gerando hydration
 * mismatch (React #418) que travava o componente no skeleton. `ssr: false`
 * skipa SSR e elimina o mismatch — UX equivalente (skeleton → mount).
 *
 * Bug P0 follow-up 2026-05-25: PR #43 originalmente colocou `ssr: false`
 * em `chat/page.tsx` (server component), o que parecia funcionar local mas
 * quebrou o build Vercel (Next 16 turbopack reporta como erro fatal).
 * Resultado: 4 PRs subsequentes (#44, #45, #46) ficaram com builds em
 * estado ERROR e nada deployou. Este wrapper resolve definitivamente.
 *
 * Follow-up estrutural (M1): refatorar getDateLabel/etc pra serem
 * timezone-stable usando timestamp do server via prop + Intl.DateTimeFormat
 * com timeZone fixo. Aí ChatRoom pode voltar a SSR.
 */

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// `ssr: false` válido aqui porque o arquivo é "use client".
const ChatRoomInner = dynamic(() => import("./ChatRoom"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse bg-gray-100 rounded-xl h-96" />
  ),
});

export default function ChatRoomLoader(
  props: ComponentProps<typeof ChatRoomInner>,
) {
  return <ChatRoomInner {...props} />;
}
