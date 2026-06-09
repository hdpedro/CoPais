# Widget "Hoje: quem leva/busca" — Spec de implementação (Fase 3)

> Status: **especificado, não implementado.** É o item de maior custo nativo (WidgetKit/Swift + App Widget/Kotlin + config plugin Expo) e **só valida em EAS build** — não dá pra escrever às cegas com qualidade. Esta spec deixa pronto pra um dev nativo + EAS.

## Objetivo
Widget de home screen (iOS + Android) que mostra, sem abrir o app:
```
Hoje
👩 Fernanda leva os meninos
👨 Henrique busca às 17h30
```

## Fonte de dados (JÁ PRONTA)
`GET /api/care-routine/today?date=YYYY-MM-DD` (Bearer) → `{ arrangement, today: RoutineToday }`. O `RoutineToday.entries[]` traz `dropoff`/`pickup` `{ responsibleName, time, isMe }` + `childNames`. O widget consome isso (mesmo shape do `RoutineTodayCard`).

- **Auth no widget**: o token do usuário precisa estar acessível ao widget. Compartilhar via App Group (iOS) / SharedPreferences (Android) — o app grava o `access_token` (e refresh) num storage compartilhado no login; o widget lê. Reusar o que o app já faz pra push/sessão.
- **Cache**: gravar o último `RoutineToday` resolvido num App Group/SharedPreferences a cada foreground do app (o `useCareRoutineToday` já busca) — o widget renderiza do cache + tenta refresh no timeline reload. Evita depender de rede no render do widget.

## iOS (WidgetKit, Swift)
1. Target de Widget Extension via **config plugin Expo** (`@bacons/apple-targets` ou plugin custom em `app.config.js`) — adiciona o target ao `.xcodeproj` no prebuild/EAS.
2. `TimelineProvider`: `getTimeline` lê o cache do App Group (`group.com.kindar.app`), monta entries; reload policy `.after(próxima meia-noite BRT)` + on-demand quando o app grava novo cache (`WidgetCenter.shared.reloadAllTimelines()`).
3. View (SwiftUI): título "Hoje" + 1-2 linhas (leva/busca) com emoji + nome + hora. Suportar `systemSmall` + `systemMedium`. Paleta = tokens (#2C2C2C texto, #5B9E85). i18n: ler locale do App Group (o app já resolve) — strings espelham `careRoutine.hero*`.
4. Entitlement App Group no `app.json` (`ios.entitlements`).

## Android (App Widget, Kotlin)
1. `AppWidgetProvider` + layout XML (RemoteViews) via config plugin (copiar `res/` + registrar no Manifest no prebuild).
2. `onUpdate`: ler SharedPreferences compartilhado, popular RemoteViews (TextViews leva/busca). Atualização: `AlarmManager`/`WorkManager` diário + trigger do app via `AppWidgetManager.updateAppWidget` quando grava novo cache.
3. Tap → deep link `kindar://dashboard` (já existe rota `/dashboard`).

## Config plugin (JS — pode ser escrito agora com segurança)
`app.config.js`/`app.json` plugin que: declara o App Group (iOS) + a permissão/Manifest (Android) + copia os arquivos nativos do widget no prebuild. Sem o plugin, o widget some no próximo `expo prebuild`.

## Critério de pronto (precisa EAS + device)
- Widget aparece no seletor de widgets iOS + Android.
- Mostra a rotina de hoje correta (validar contra o card do app).
- Atualiza ao mudar a rotina (trocar hoje) — reload disparado pelo app.
- Tap abre o /dashboard.
- i18n nos 5 idiomas. Estados: sem rotina → "Configure a rotina"; offline → último cache.

## Risco/custo
Alto (Swift + Kotlin + plugin + 2 targets de build). Estimativa: 1-2 dias de dev nativo + iterações de EAS build. Recomendo priorizar DEPOIS de validar a Fase 1/2 em produção (o widget é retenção, não core).
