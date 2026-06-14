# Runbook OTA — Paridade de Scheduling Native (itens 1+3)

Publica via OTA o **editor de rotina** (`abd0a29`) + o **briefing "Sua Atenção"**
(`070f98f`). Ambos são **JS/lógica compartilhada** (Regra 19), **sem dependência
nativa nova** → OTA-safe nos 8 runtimes em produção.

> ⚠️ Outward-facing. Validar em device ANTES (toques na grade do editor + briefing
> navegando). Só publicar com OK.

---

## 0. Pré-condições (checar TODAS antes de bundlar)

| Item | Estado | Como conferir |
|---|---|---|
| Sem dep nativa nova | ✅ | Imports usados (`react-native`, `expo-router`, `expo-haptics`, design-system, libs existentes) já estão nos binários. **Nenhum** `expo-linear-gradient`/pacote novo. |
| tsc / lint / testes | ✅ | `cd kindar-native && npx tsc --noEmit` (0) · `npm run test:unit` (114/114) |
| Meus commits no topo | ✅ | `git log --oneline -2` → `070f98f`, `abd0a29` |
| Login EAS | conferir | `npx eas-cli whoami` (relogar se preciso: `npx eas-cli login`) |
| `metro.config maxWorkers=3` | ✅ | já capado (evita OOM no bundle de 16 cores) |

---

## 1. ⚠️ Isolar a sessão paralela (OTA empacota a *working tree*, não o HEAD)

Há trabalho **não-commitado de outra sessão** (Saúde) na árvore. Se bundlar agora,
a OTA leva esse trabalho inacabado junto. **Stash só os arquivos native dela**
antes de publicar (os `src/...` do PWA não entram no bundle native, pode ignorar):

```bash
cd "C:/Users/henri/OneDrive/Área de Trabalho/APP CoPais/DEV"

# Confirme o que é da paralela (NÃO deve ter nada meu — meus 2 commits já estão no HEAD)
git status --short

# Stash só os arquivos native da paralela (reverte ao HEAD = meu trabalho presente, o dela sai)
git stash push -m "paralela-saude (out do bundle OTA)" -- \
  "kindar-native/app/(tabs)/saude.tsx" \
  "kindar-native/app/saude/registrar.tsx" \
  "kindar-native/app/_src/i18n/locales/pt.json" \
  "kindar-native/app/_src/i18n/locales/en.json" \
  "kindar-native/app/_src/i18n/locales/es.json" \
  "kindar-native/app/_src/i18n/locales/fr.json" \
  "kindar-native/app/_src/i18n/locales/de.json"

# Sanity: a árvore native agora deve refletir só o que está no HEAD (meu trabalho)
git status --short    # esperado: limpo nos arquivos native acima
cd kindar-native && npx tsc --noEmit   # 0 erros confirma a árvore que vai bundlar
```

---

## 2. Publicar — sequencial Android → iOS, `--platform` explícito

> **Nunca 2 OTAs em paralelo** (compartilham `dist/` → quebram). **Sempre
> sequencial**. `--platform` explícito sempre (nunca atingir um SO por acidente).
> Os `npm run ota:*` não passam `--message` — anexe com `-- --message "..."`.

```bash
cd "C:/Users/henri/OneDrive/Área de Trabalho/APP CoPais/DEV/kindar-native"

# (a) ANDROID primeiro — 8 runtimes, canal production
npm run ota:android -- --message "feat(native): editor de rotina + Sua Atenção abaixo do herói (paridade PWA)"

# espere terminar 100% (8/8) antes de seguir

# (b) iOS depois — mesma mensagem
npm run ota:ios -- --message "feat(native): editor de rotina + Sua Atenção abaixo do herói (paridade PWA)"
```

Cada chamada percorre `1.0.7, 1.0.8, 1.0.9, 1.0.10, 1.0.11, 1.0.13, 1.0.19, 1.0.21`,
trocando `app.json:version` por runtime e **restaurando pra 1.0.21** no fim (mesmo
em erro/Ctrl+C). **Nunca** rode com `| tee` (mascara o exit code → falha vira "ok").

---

## 3. Restaurar a sessão paralela

```bash
cd "C:/Users/henri/OneDrive/Área de Trabalho/APP CoPais/DEV"
git stash pop      # devolve o trabalho da Saúde à árvore
git status --short # confirma saude.tsx/registrar.tsx/locales de volta (unstaged)
```

> Se `git stash pop` der conflito nos locales (porque meu `pendingReportFamily`
> commitado encosta no hunk de Saúde): resolver **no nível de chave** (manter as
> duas adições), nunca merge textual cego. Em geral não conflita — hunks ficam em
> regiões distintas (linha ~3571 Saúde vs ~4687 briefing).

---

## 4. Verificar

```bash
cd "C:/Users/henri/OneDrive/Área de Trabalho/APP CoPais/DEV/kindar-native"
# Últimos updates publicados no canal production (deve listar android+ios por runtime)
npx eas-cli update:list --branch production --limit 20

# app.json restaurado?
node -e "console.log(require('./app.json').expo.version)"   # 1.0.21
```

**No device** (binário com runtime alvo, ex. tester Android vc38=1.0.21):
1. Forçar reabertura do app (puxa a OTA).
2. Dashboard: "Sua Atenção" aparece **logo abaixo do herói**; relato pendente
   ("Aconteceu?·Relatar") está nela, não mais espalhado embaixo.
3. Tocar "Montar rotina" no herói (família together/single sem guarda) →
   abre o editor `/calendario/rotina`. Preencher uma célula, salvar, ver toast.

---

## Rollback

OTA é reversível republicando o update anterior:
```bash
npx eas-cli update:list --branch production           # achar o groupId anterior
npx eas-cli update:republish --group <GROUP_ID_ANTERIOR>
```
Como não há binário novo, rollback é instantâneo no próximo reload dos devices.

---

## Notas

- **PWA não precisa de deploy**: o briefing "Sua Atenção" já existia no PWA; estes
  commits são 100% native. Nada a subir no Vercel.
- **Runtime pitfall**: users em binário antigo que nunca puxaram OTA recente não
  recebem (esperado). Estas são melhorias de paridade de UI, não fix crítico —
  aceitável sem bump de versão / build novo.
- Commits: `abd0a29` (editor) · `070f98f` (briefing). Nenhum publicado ainda.
