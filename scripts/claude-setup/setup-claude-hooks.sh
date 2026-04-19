#!/bin/bash
# ============================================================================
# Setup Claude Code git sync hooks (idempotente, seguro rodar multiplas vezes)
# ============================================================================
# O que faz:
#   1. Cria ~/.claude/session-start-git-sync.sh (pull automatico no inicio)
#   2. Cria ~/.claude/stop-hook-git-check.sh (bloqueia sair sem commit+push)
#   3. Registra os dois hooks em ~/.claude/settings.json
#   4. Valida tudo
# ============================================================================

set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
SESSION_START_SCRIPT="$CLAUDE_DIR/session-start-git-sync.sh"
STOP_SCRIPT="$CLAUDE_DIR/stop-hook-git-check.sh"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[claude-setup]${NC} $1"; }
ok()   { echo -e "${GREEN}[ok]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
fail() { echo -e "${RED}[fail]${NC} $1"; exit 1; }

# ── Pre-flight ─────────────────────────────────────────────────────────────
command -v git >/dev/null 2>&1 || fail "git nao encontrado — instale git primeiro"
command -v jq  >/dev/null 2>&1 || fail "jq nao encontrado — instale jq (sudo apt install jq / brew install jq / choco install jq)"

log "Configurando Claude Code hooks em $CLAUDE_DIR"
mkdir -p "$CLAUDE_DIR"

# ── 1. Script session-start-git-sync.sh ────────────────────────────────────
log "Criando session-start-git-sync.sh..."
cat > "$SESSION_START_SCRIPT" << 'SESSION_START_EOF'
#!/bin/bash
# Session-start git sync hook — auto-pull no inicio de cada sessao Claude

cat >/dev/null 2>&1

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

current_branch=$(git branch --show-current 2>/dev/null)

if [[ -z "$current_branch" ]]; then
  echo "[git-sync] Detached HEAD — skipping auto-pull" >&2
  exit 0
fi

if ! git fetch origin --quiet 2>/dev/null; then
  echo "[git-sync] Warning: git fetch origin failed" >&2
  exit 0
fi

if ! git rev-parse --verify --quiet "origin/$current_branch" >/dev/null 2>&1; then
  echo "[git-sync] Remote branch origin/$current_branch does not exist — skipping pull" >&2
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[git-sync] Warning: uncommitted changes present — skipping pull" >&2
  exit 0
fi

local_sha=$(git rev-parse "$current_branch" 2>/dev/null)
remote_sha=$(git rev-parse "origin/$current_branch" 2>/dev/null)

if [[ "$local_sha" == "$remote_sha" ]]; then
  exit 0
fi

if git pull --ff-only origin "$current_branch" --quiet 2>/dev/null; then
  echo "[git-sync] Updated branch $current_branch to latest from origin"
else
  echo "[git-sync] Warning: fast-forward pull failed on $current_branch (diverged ou conflito) — merge manual necessario" >&2
fi

exit 0
SESSION_START_EOF

chmod +x "$SESSION_START_SCRIPT"
ok "session-start-git-sync.sh criado"

# ── 2. Script stop-hook-git-check.sh ────────────────────────────────────────
log "Criando stop-hook-git-check.sh..."
cat > "$STOP_SCRIPT" << 'STOP_EOF'
#!/bin/bash
# Stop hook — bloqueia o fim da sessao se houver commits/arquivos nao pushados

input=$(cat)

stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active')
if [[ "$stop_hook_active" = "true" ]]; then
  exit 0
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

no_pr_reminder="Do not create a pull request unless the user has explicitly asked for one."

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "There are uncommitted changes in the repository. Please commit and push these changes to the remote branch. $no_pr_reminder" >&2
  exit 2
fi

untracked_files=$(git ls-files --others --exclude-standard)
if [[ -n "$untracked_files" ]]; then
  echo "There are untracked files in the repository. Please commit and push these changes to the remote branch. $no_pr_reminder" >&2
  exit 2
fi

current_branch=$(git branch --show-current)
if [[ -n "$current_branch" ]]; then
  if git rev-parse "origin/$current_branch" >/dev/null 2>&1; then
    unpushed=$(git rev-list "origin/$current_branch..HEAD" --count 2>/dev/null) || unpushed=0
    if [[ "$unpushed" -gt 0 ]]; then
      echo "There are $unpushed unpushed commit(s) on branch '$current_branch'. Please push these changes to the remote repository. $no_pr_reminder" >&2
      exit 2
    fi
  else
    unpushed=$(git rev-list "origin/HEAD..HEAD" --count 2>/dev/null) || unpushed=0
    if [[ "$unpushed" -gt 0 ]]; then
      echo "Branch '$current_branch' has $unpushed unpushed commit(s) and no remote branch. Please push these changes to the remote repository. $no_pr_reminder" >&2
      exit 2
    fi
  fi
fi

exit 0
STOP_EOF

chmod +x "$STOP_SCRIPT"
ok "stop-hook-git-check.sh criado"

# ── 3. settings.json — merge cuidadoso ──────────────────────────────────────
log "Atualizando settings.json..."

# Backup
if [[ -f "$SETTINGS_FILE" ]]; then
  cp "$SETTINGS_FILE" "${SETTINGS_FILE}.backup.$(date +%Y%m%d%H%M%S)"
  ok "Backup salvo: ${SETTINGS_FILE}.backup.*"
fi

# Cria settings.json vazio se nao existir
if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Merge os hooks preservando o que ja existe
TMP_FILE=$(mktemp)
jq '
  .["$schema"] = "https://json.schemastore.org/claude-code-settings.json" |
  .hooks = (.hooks // {}) |
  .hooks.SessionStart = [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "~/.claude/session-start-git-sync.sh",
          "timeout": 15
        }
      ]
    }
  ] |
  .hooks.Stop = [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "~/.claude/stop-hook-git-check.sh"
        }
      ]
    }
  ] |
  .permissions = (.permissions // {}) |
  .permissions.allow = ((.permissions.allow // []) + ["Skill"] | unique)
' "$SETTINGS_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$SETTINGS_FILE"
ok "settings.json atualizado"

# ── 4. Validacao ────────────────────────────────────────────────────────────
log "Validando..."

if ! jq . "$SETTINGS_FILE" >/dev/null 2>&1; then
  fail "settings.json tem JSON invalido! Restaurar backup."
fi

session_cmd=$(jq -er '.hooks.SessionStart[0].hooks[0].command' "$SETTINGS_FILE" 2>/dev/null || echo "")
stop_cmd=$(jq -er '.hooks.Stop[0].hooks[0].command' "$SETTINGS_FILE" 2>/dev/null || echo "")

[[ "$session_cmd" == *"session-start-git-sync.sh" ]] || fail "SessionStart hook nao registrado corretamente"
[[ "$stop_cmd" == *"stop-hook-git-check.sh" ]] || fail "Stop hook nao registrado corretamente"

# Teste os scripts
echo '{}' | "$SESSION_START_SCRIPT" >/dev/null 2>&1 || warn "session-start script retornou erro (pode ser normal se nao estiver em repo git)"
echo '{"stop_hook_active":false}' | "$STOP_SCRIPT" >/dev/null 2>&1 || true  # pode falhar se houver uncommitted

ok "Scripts validados"

# ── Resumo ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  CONFIGURADO COM SUCESSO"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Hooks ativos:"
echo "  • SessionStart → pull automatico ao iniciar sessao"
echo "  • Stop          → bloqueia sair sem commit+push"
echo ""
echo "  Arquivos criados:"
echo "  • $SESSION_START_SCRIPT"
echo "  • $STOP_SCRIPT"
echo "  • $SETTINGS_FILE"
echo ""
echo "  Proximos passos:"
echo "  1. Se o Claude ja estiver aberto, rode /hooks para recarregar"
echo "     (ou feche e abra o Claude Code de novo)"
echo "  2. Testar: abra um repo git e inicie uma sessao"
echo "     Voce deve ver '[git-sync] Updated branch X...' se houver mudancas"
echo ""
ok "Pronto!"
