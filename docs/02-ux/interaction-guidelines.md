# Diretrizes de Interacao - Kindar

> Como o app responde, anima, carrega e se comporta em todas as situacoes.
> Versao: 1.0 | Atualizado: Marco 2026

---

## 1. Animacoes e Transicoes

### Principio Geral
Animacoes no Kindar sao **funcionais, nao decorativas**. Servem para dar feedback de acao, orientar atencao e suavizar transicoes. Nunca devem ser chamativas ou distrair.

### Tabela de Tokens de Animacao

| Tipo                    | Duracao  | Easing        | Uso                                    |
|-------------------------|----------|---------------|----------------------------------------|
| Hover/focus             | `150ms`  | `ease-out`    | Mudanca de cor em botoes, links         |
| Transicao de cor        | `200ms`  | `ease-in-out` | Tabs, navegacao, badges                 |
| Abertura de modal/sheet | `300ms`  | `ease-out`    | DayDetailSheet, SwapRequestModal        |
| Fechamento              | `200ms`  | `ease-in`     | Dismiss de modais                       |
| Skeleton pulse          | `2s`     | `ease-in-out` | Loading states (animate-pulse)          |
| Fade in de conteudo     | `200ms`  | `ease-out`    | Apos skeleton desaparecer               |

### Regras
- **Maximo 300ms** para qualquer animacao de interface
- **Respeitar `prefers-reduced-motion`**: desativar todas as animacoes decorativas
- **Nunca animar cor de fundo** da pagina inteira
- **Nunca usar bounce/elastic** - transmite informalidade inadequada
- Transicoes CSS apenas (`transition-colors`, `transition-opacity`)
- Zero dependencias de animacao (sem Framer Motion, sem GSAP)

---

## 2. Loading States

### 2.1 Skeleton Screens (Implementado)

O Kindar usa skeleton screens como padrao para todos os carregamentos. Nunca spinners, nunca tela em branco.

**Padrao de implementacao:**
```
Pagina carregando:
+------------------------------------------+
|  ████████████████  (heading)             |
|  ████████  (subtitle)                    |
|                                          |
|  +------------------------------------+  |
|  | ████████████████████████  (card)   |  |
|  | ████████████                        |  |
|  +------------------------------------+  |
|  +------------------------------------+  |
|  | ████████████████████████           |  |
|  | ████████████                        |  |
|  +------------------------------------+  |
+------------------------------------------+
```

**Classes utilizadas:**
- `animate-pulse` no container
- `bg-gray-200 rounded` nos blocos
- Heights variados para simular texto/cards

### 2.2 Inline Loading

Para acoes dentro da pagina (salvar, votar, aprovar):
- Botao mostra "Salvando..." com `opacity-50 cursor-not-allowed`
- Desabilitar formulario inteiro durante submissao
- Nunca esconder o formulario durante submit

### 2.3 Streaming com Suspense

O layout principal usa `<Suspense>` para streaming:
- Shell (sidebar/nav) renderiza imediatamente
- Conteudo da pagina carrega via Server Component
- Fallback: `null` (shell ja visivel e suficiente)

---

## 3. Atualizacoes Otimistas

### 3.1 Chat (Implementado)

```
Usuario digita mensagem
       |
       v
  [Mensagem aparece IMEDIATAMENTE na tela]
  (com estilo visual identico a mensagem final)
       |
       +---> Supabase Realtime envia para todos
       |
       +---> Se falhar: mensagem some com fade
             + toast: "Nao foi possivel enviar"
```

**Detalhes:**
- Mensagem otimista recebe `opacity-80` ate confirmacao do servidor
- Scroll automatico para baixo apos envio
- Read receipts (`read_by`) atualizados via Realtime

### 3.2 Votacao em Decisoes (Implementado)

```
Usuario clica "Concordo"
       |
       v
  [Botao muda para estado "votado" IMEDIATAMENTE]
  [Badge "Seu voto: Concordo" aparece]
       |
       +---> Server Action processa
       |
       +---> Se falhar: reverte estado
             + mensagem de erro
```

### 3.3 Aprovacao de Despesas

```
Usuario clica "Aprovar"
       |
       v
  [Card muda para estado "aprovado" IMEDIATAMENTE]
  [Badge verde "Aprovado" aparece]
       |
       +---> Server Action processa
       +---> revalidatePath("/despesas")
```

---

## 4. Pull-to-Refresh

### Status: NAO IMPLEMENTADO (Recomendado)

**Recomendacao de implementacao:**

| Pagina          | Prioridade | Motivo                                        |
|-----------------|------------|-----------------------------------------------|
| Dashboard       | Alta       | Dados mudam frequentemente (guarda, checkins)  |
| Chat            | Baixa      | Realtime ja atualiza automaticamente           |
| Calendario      | Media      | Trocas aprovadas podem nao refletir imediatamente |
| Saude           | Media      | Medicamentos e doencas podem ser atualizados    |

**Comportamento esperado:**
- Pull > 60px: ativa refresh
- Animacao de "puxar": arco de progresso no topo
- Recarrega via `router.refresh()` do Next.js
- Timeout de 5s: mostra "Sem alteracoes" se nada mudou

---

## 5. Haptic Feedback

### Status: NAO IMPLEMENTADO (Recomendado)

**Onde aplicar:**

| Acao                        | Tipo de Haptic      | API                            |
|-----------------------------|---------------------|--------------------------------|
| Votar em decisao            | `success` (medio)   | `navigator.vibrate(50)`        |
| Aprovar troca               | `success` (medio)   | `navigator.vibrate(50)`        |
| Rejeitar troca              | `warning` (leve)    | `navigator.vibrate([30, 20, 30])` |
| Enviar mensagem no chat     | `light` (sutil)     | `navigator.vibrate(10)`        |
| Confirmar liquidacao        | `success` (forte)   | `navigator.vibrate(100)`       |
| Erro de validacao           | `error` (padrao)    | `navigator.vibrate([20, 40, 20])` |

**Regra**: Haptic e um reforco, nunca a unica indicacao de feedback. Sempre acompanhar de feedback visual.

---

## 6. Comportamento Offline

### Status: PARCIALMENTE IMPLEMENTADO

### Situacao Atual
- **Service Worker**: registrado (`sw.js`) para push notifications
- **Cache de dados**: nao implementado
- **Queue de acoes**: nao implementado

### Comportamento Recomendado

| Cenario              | Comportamento Atual        | Comportamento Ideal                      |
|----------------------|----------------------------|------------------------------------------|
| Sem conexao          | Erro de rede               | Mostra dados em cache + banner offline   |
| Enviar mensagem      | Falha silenciosa           | Queue local, envia quando reconectar     |
| Registrar check-in   | Erro de rede               | Salvar local, sync automatico            |
| Ver calendario       | Pagina nao carrega         | Mostrar ultimo estado conhecido           |
| Upload de recibo     | Falha                      | Queue o upload, mostrar "pendente"        |

### Banner Offline Recomendado
```
+------------------------------------------+
| ⚠ Voce esta offline. Dados podem estar  |
|   desatualizados.                        |
+------------------------------------------+
```

- Background: `bg-amber-50 border-b border-amber-200`
- Texto: `text-amber-800 text-[13px]`
- Posicao: topo da tela, abaixo do header
- Dismiss: nao (desaparece automaticamente ao reconectar)

---

## 7. Navegacao por Tabs

### 7.1 Bottom Navigation (Mobile - 5 tabs)

| Tab        | Rota           | Icone       |
|------------|----------------|-------------|
| Inicio     | `/dashboard`   | Casa        |
| Calendario | `/calendario`  | Calendario  |
| Chat       | `/chat`        | Balao       |
| Familia    | `/familia`     | Pessoas     |
| Mais       | `/mais`        | Grid 2x2    |

**Comportamento:**
- Tab ativa: cor `#E8734A`, strokeWidth 2, label bold
- Tab inativa: cor `#9CA3AF`, strokeWidth 1.5, label medium
- Transicao de cor: `transition-colors` (200ms)
- `prefetch={false}` em todos os links (economia de dados)
- Sem animacao de deslize entre paginas

### 7.2 Sidebar (Desktop - Secoes Agrupadas)

| Secao           | Itens                                           |
|-----------------|--------------------------------------------------|
| (sem titulo)    | Inicio                                            |
| Organizacao     | Calendario, Check-in                              |
| Comunicacao     | Chat, Acordos, Decisoes, Temas Sensiveis          |
| Familia         | Criancas, Familia, Saude, Escola                  |
| Financeiro      | Resumo Financeiro, Despesas, Documentos           |
| Conta           | Convidar Responsavel                               |

### 7.3 Tabs Internas (Pill Style)

Usadas em:
- Perfil da crianca (4 abas: Geral, Saude, Escola, Atividades)
- Chat (canais: Geral, por crianca, Financeiro)
- Financeiro (Resumo, Despesas, Liquidacoes)

**Comportamento:**
- Nao usa roteamento (estado local `useState`)
- Troca instantanea (sem loading)
- Persiste aba ativa durante a sessao

---

## 8. Validacao de Formularios

### Principio: Inline, imediato, construtivo

### Momento da Validacao

| Tipo                | Quando                      | Visual                              |
|---------------------|-----------------------------|--------------------------------------|
| Campos obrigatorios | Ao tentar submeter           | Border vermelha + mensagem abaixo   |
| Formato (email)     | Ao sair do campo (blur)      | Mensagem inline                     |
| Valor numerico      | Enquanto digita              | Nao aceita caracteres invalidos      |
| Tamanho de arquivo  | Ao selecionar arquivo        | Mensagem imediata                    |
| Data invalida       | Ao selecionar data           | Mensagem inline                     |

### Validacao Server-Side (Obrigatoria)

Toda Server Action faz validacao independente:
```
1. Verifica autenticacao (getUser())
2. Verifica autorizacao (verifyGroupMembership())
3. Valida inputs (trim, parse, type check)
4. Retorna erro via redirect com query param ?error=
```

### Feedback Visual de Validacao

```
Estado normal:
+------------------------------+
| [Input____________________]  |  border-gray-200
+------------------------------+

Estado de erro:
+------------------------------+
| [Input____________________]  |  border-red-400, bg-red-50
| Campo obrigatorio.           |  text-red-600, text-[12px]
+------------------------------+

Estado de sucesso (apos corrigir):
+------------------------------+
| [Input____________________]  |  border-[#0EA5A0], ring-2
+------------------------------+
```

### Erros de Server Action
Erros retornados via URL query params (`?error=...&success=...`) sao exibidos em:
- Toast/banner no topo da pagina
- Background: `bg-red-50 border-red-200` (erro) ou `bg-green-50 border-green-200` (sucesso)
- Auto-dismiss apos 5 segundos

---

## 9. Gestos e Interacoes Moveis

### Gestos Atuais
| Gesto          | Onde              | Acao                          |
|----------------|-------------------|-------------------------------|
| Tap            | Em qualquer lugar  | Acao padrao                   |
| Long press     | Nao implementado   | -                             |
| Swipe lateral  | Nao implementado   | -                             |
| Pinch zoom     | Nao implementado   | -                             |

### Gestos Recomendados para Futuro
| Gesto           | Onde              | Acao                         | Prioridade |
|-----------------|-------------------|------------------------------|------------|
| Swipe right     | Card de despesa    | Aprovar rapidamente          | Media      |
| Swipe left      | Card de despesa    | Rejeitar                     | Media      |
| Long press      | Dia no calendario  | Abrir opcoes (troca/evento)  | Alta       |
| Pull-to-refresh | Todas as listas    | Atualizar dados              | Alta       |

---

## 10. Acessibilidade de Interacao

### Navegacao por Teclado
- Todos os elementos interativos acessiveis via Tab
- Focus ring visivel: `ring-2 ring-[#0EA5A0]/20`
- Enter/Space ativam botoes e links
- Escape fecha modais e sheets

### Screen Reader
- `aria-label` em todos os icones de navegacao
- `aria-current="page"` no item de menu ativo
- `role="navigation"` nos containers de nav
- Labels de formulario associados a inputs via `htmlFor`
- Tabela de dados com `scope="col"` e `scope="row"`

### Touch Targets
- Minimo: `44px x 44px` (WCAG 2.5.5)
- BottomNav items: `56px largura x 44px altura`
- Botoes de acao: `full-width` em mobile, `min-h-[44px]`
- Links inline: `padding vertical` suficiente para toque

### Contraste
- Texto sobre fundo branco: `#1A3B3A` (ratio > 10:1)
- Texto muted: `#7A8C8B` sobre `#FFFFFF` (ratio 4.5:1)
- Botao primario: branco sobre `#0EA5A0` (ratio 4.6:1)
- Icone ativo: `#E8734A` sobre branco (ratio 3.1:1 - borderline, compensado por peso bold)

---

## 11. Performance Percebida

### Tecnicas Aplicadas

| Tecnica                   | Implementacao                           | Impacto                       |
|---------------------------|------------------------------------------|-------------------------------|
| SSR completo              | Todas as paginas sao Server Components   | First paint rapido             |
| Parallel data fetching    | `Promise.all()` em dashboard (10+ queries)| Reduz latencia de dados       |
| Prefetch desligado        | `prefetch={false}` em nav links          | Economia de bandwidth          |
| Skeleton screens          | `animate-pulse` durante loading          | Percecao de velocidade         |
| Consolidacao de queries   | 1 query para 3 meses de custody_events   | Menos round-trips ao DB        |
| Streaming                 | `<Suspense>` no layout raiz              | Shell imediato                 |

### Metricas Alvo
| Metrica | Alvo     | Situacao Atual  |
|---------|----------|-----------------|
| LCP     | < 2.5s   | ~2.0s (bom)     |
| FID     | < 100ms  | ~50ms (bom)     |
| CLS     | < 0.1    | ~0.05 (bom)     |
| TTFB    | < 800ms  | ~400ms (Vercel) |

---

*Estas diretrizes devem ser revisadas quando novas interacoes forem adicionadas ao app.*
