# Smart link `/baixar` — link único rastreável de download

Link único pra bio de redes sociais (Instagram, TikTok…) que detecta o
aparelho e redireciona pra loja certa, **registrando o clique no PostHog**
pra entrar no funil de aquisição → ativação que já medimos.

Substitui o `bit.ly` (que cobra pra mostrar os dados) e os **dois** links
da bio (iOS + Site) por **um só**: `https://www.kindar.com.br/baixar`.

## Como funciona

`GET /baixar` ([route](../../src/app/baixar/route.ts)):

1. Lê os `utm_*` da query (com defaults neutros).
2. Detecta o SO pelo User-Agent (`detectDeviceOs`), com override opcional
   `?p=ios|android` pra posts específicos de plataforma.
3. Redireciona (302):
   - **iOS** → App Store + `ct=<campanha>` (token de campanha da Apple)
   - **Android** → Play Store + `referrer=<utm…>` (Play Install Referrer)
   - **Desktop** → home `/` com os UTMs repassados (mostra os selos das lojas)
4. Dispara o evento `store_link_click` no PostHog via `after()` (resposta
   instantânea + flush garantido no Vercel).

Toda a lógica pura vive em [`src/lib/store-links.ts`](../../src/lib/store-links.ts)
(testada em [`tests/store-links.test.ts`](../../tests/store-links.test.ts)).

## Middleware

`/baixar` é **excluído do matcher** em [`src/middleware.ts`](../../src/middleware.ts).
Motivo: o `updateSession` redireciona qualquer rota não-pública pra
`/session-recovery` quando o visitante está deslogado — que é o caso de
todo clique vindo do Instagram. Pular o middleware evita esse bounce e
deixa o redirect rápido (sem o `getUser` do Supabase a cada clique).

## PostHog

Evento `store_link_click` (nome local em `store-links.ts`, **fora** do
catálogo `EVENTS` de propósito — é PWA-only e quebraria o teste de
paridade PWA↔Native). Propriedades:

| prop | exemplo | uso |
|------|---------|-----|
| `device_os` | `ios` / `android` / `desktop` | comparar plataformas |
| `destination` | `app_store` / `play_store` / `web` | pra onde foi |
| `utm_source` | `instagram` | canal |
| `utm_medium` | `bio` / `reel` / `story` | formato |
| `utm_campaign` | `reel-rotina-jun` | a peça específica |
| `utm_content` / `utm_term` | opcionais | variações |

`distinct_id`: usa o cookie anônimo do posthog-js quando presente (atribui
o clique a uma pessoa existente → funil completo pra quem já visitou),
senão gera um id anônimo novo.

### Ler no PostHog
- **Cliques no tempo**: Trends de `store_link_click`, breakdown por hora →
  curva de decaimento depois de cada post (pico nas primeiras horas, cauda
  em 24/48h).
- **Por campanha/post**: breakdown por `utm_campaign`.
- **iOS vs Android**: breakdown por `device_os`.
- **Funil**: `store_link_click` → `signup_completed` → ativação.

## Atribuição de download (conversão real, nativa e grátis)
- **iOS**: App Store Connect › Análise de Apps agrupa por `ct`.
- **Android**: Play Console › Aquisição lê o `referrer` (UTM).

## Taxonomia de UTM (obrigatória, sempre minúscula, sem acento)
- `utm_source` = canal: `instagram`, `tiktok`
- `utm_medium` = formato: `bio`, `reel`, `story`, `post`
- `utm_campaign` = peça: `reel-rotina-jun`, `post-vacina`

## Validação
- Unit: `node node_modules/vitest/vitest.mjs run tests/store-links.test.ts` (13 testes)
- Tipos: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.typecheck.json`
- Smoke: `next dev` + `curl /baixar` com UAs de iPhone/Android/desktop —
  302 correto em todos, sem bounce pra `/session-recovery`.
