# Claude Code Hooks Setup

Configura hooks de sincronizacao git automatica no Claude Code. Util quando
mais de uma pessoa trabalha no mesmo repo.

## O que faz

| Hook | Quando roda | Acao |
|------|-------------|------|
| **SessionStart** | Ao iniciar sessao do Claude | `git fetch` + `git pull --ff-only` na branch atual |
| **Stop** | Ao tentar fechar sessao | Bloqueia se ha mudancas nao commitadas ou nao pushadas |

Resultado: voce sempre comeca atualizado e nunca deixa trabalho para tras.

## Como usar

### Linux / macOS / WSL

```bash
# Clone o repo (se ainda nao tiver)
git clone https://github.com/hdpedro/copais.git
cd copais

# Execute o setup
bash scripts/claude-setup/setup-claude-hooks.sh
```

### Windows (sem WSL)

Se usar Claude Code via Git Bash no Windows (mesma coisa — bash):

```bash
bash scripts/claude-setup/setup-claude-hooks.sh
```

## Requisitos

- `git` instalado
- `jq` instalado — para validar/editar JSON
  - **Linux:** `sudo apt install jq`
  - **macOS:** `brew install jq`
  - **Windows:** `choco install jq` ou baixar em https://jqlang.github.io/jq/

## Depois de rodar o setup

1. Se o Claude ja estiver aberto, digite `/hooks` no chat para recarregar
2. Ou feche e abra o Claude Code de novo
3. Teste: abra um repo git. Ao iniciar, se houver commits novos no remoto,
   voce vera `[git-sync] Updated branch X to latest from origin`

## E seguro?

Sim:

- O SessionStart hook **so** faz `git pull --ff-only` — nunca sobrescreve commits locais
- Se voce tem mudancas nao commitadas, ele detecta e **nao faz pull** (evita perder trabalho)
- Se a branch divergiu, ele **avisa** em vez de forcar
- Backup do `settings.json` e criado antes de qualquer mudanca

## Desfazer

Se quiser remover os hooks:

```bash
# Restaurar o backup mais recente:
ls ~/.claude/settings.json.backup.*
cp ~/.claude/settings.json.backup.<timestamp> ~/.claude/settings.json

# Remover os scripts (opcional):
rm ~/.claude/session-start-git-sync.sh
rm ~/.claude/stop-hook-git-check.sh
```

## Fluxo de trabalho recomendado (2 devs)

Para evitar colisoes entre voce e o socio:

1. **Cada um usa sua propria branch**
   - `claude/henrique-<feature>`
   - `claude/angelino-<feature>`

2. **Merge para `main` apos revisao**
   - Nao faz push direto para `main` sem avisar o outro

3. **Avise no Discord antes de trabalhar em `main`**
   - Evita pull com conflito
