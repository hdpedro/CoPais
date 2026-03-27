# Design System - Kindar

> Sistema de design da plataforma Kindar. Guia definitivo para consistencia visual e de interacao.
> Versao: 1.0 | Atualizado: Marco 2026

---

## 1. Marca e Identidade

### Nome
**Kindar** - Duas casas, uma familia. O nome comunica que a crianca tem dois lares igualmente validos.

### Tom Visual
Acolhedor, neutro, profissional. Nunca infantilizado. Nunca acusatorio. O design deve transmitir:
- **Calma** em momentos de tensao (trocas de guarda, doencas)
- **Neutralidade** entre os responsaveis (nunca favorece um lado)
- **Confianca** para decisoes importantes (saude, financeiro)

---

## 2. Paleta de Cores

### Cores Primarias

| Token              | Hex       | Uso                                               |
|--------------------|-----------|----------------------------------------------------|
| `primary`          | `#5B9E85` | Botoes primarios, links, icones ativos, destaques   |
| `primaryLight`     | `#E6F7F7` | Backgrounds de cards de destaque, badges leves       |
| `primaryDark`      | `#0B8A86` | Hover em botoes primarios, enfase                    |
| `secondary`        | `#D4735A` | Cor do segundo responsavel, alertas suaves           |
| `accent`           | `#E8A228` | Destaques pontuais, badges de atencao, estrelas      |

### Cores de Interface

| Token              | Hex       | Uso                                               |
|--------------------|-----------|----------------------------------------------------|
| `dark`             | `#2C2C2C` | Textos principais, headings, logo                   |
| `light`            | `#EEECEA` | Background alternativo                              |
| `bg`               | `#FFF9F5` | Background global do app (quente, acolhedor)         |
| `muted`            | `#7A8C8B` | Textos secundarios, labels, placeholders             |
| `navInactive`      | `#9CA3AF` | Icones de navegacao inativos                         |
| `navHover`         | `#6B7280` | Hover de icones de navegacao                         |
| `sidebarText`      | `#5A6B6A` | Texto de itens de menu inativos na sidebar            |

### Cores de Estado

| Token              | Hex       | Uso                                               |
|--------------------|-----------|----------------------------------------------------|
| `success`          | `#4CAF50` | Confirmacoes, aprovacoes, status ativo               |
| `warning`          | `#FFA500` | Alertas de atencao, prazos proximos                  |
| `error`            | `#E53935` | Erros de validacao, rejeicoes, status critico        |

### Cores de Responsaveis (Calendario)

| Token              | Hex       | Uso                                               |
|--------------------|-----------|----------------------------------------------------|
| `parentPrimary`    | `#5B9E85` | Primeiro responsavel no calendario (teal)            |
| `parentSecondary`  | `#D4735A` | Segundo responsavel no calendario (coral)            |

### Cor Ativa na Navegacao

| Token              | Hex       | Uso                                               |
|--------------------|-----------|----------------------------------------------------|
| `navActive`        | `#D4735A` | Icone e label do item ativo no BottomNav/Sidebar     |
| `navActiveBg`      | `#D4735A/8%` | Background do item ativo na sidebar               |

### Principio de Cores Emocionais
- **NUNCA** usar vermelho agressivo para acoes do usuario (botoes de acao)
- Vermelho (#E53935) e **exclusivo** para erros de sistema e validacao
- Alertas de saude usam `accent` (#E8A228) ou `secondary` (#D4735A), nao vermelho
- Trocas de guarda negadas usam tom neutro com explicacao, nao vermelho de "erro"

---

## 3. Tipografia

### Familia
Fontes do sistema (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). Nao ha fonte custom carregada - isso garante performance maxima e familiaridade nativa.

### Escala Tipografica

| Elemento              | Tamanho   | Peso        | Tracking    | Uso no App                        |
|-----------------------|-----------|-------------|-------------|-----------------------------------|
| Label micro           | `10px`    | `700 bold`  | `wider`     | Secao de nav sidebar, BottomNav    |
| Label padrao          | `10px`    | `500 medium`| normal      | Label inativo BottomNav             |
| Body small            | `13px`    | `500 medium`| normal      | Itens de sidebar, texto secundario  |
| Body padrao           | `13px`    | `600 semi`  | normal      | Nomes em sidebar ativa, cards       |
| Body enfase           | `15px`    | `600 semi`  | normal      | Titulos de cards, destaques         |
| Heading 3             | `18px`    | `700 bold`  | `tight`     | Titulos de secao                    |
| Heading 2             | `22px`    | `700 bold`  | `tight`     | Titulos de pagina                   |
| Heading 1             | `26px`    | `800 extra` | `tight`     | Titulo do dashboard, hero           |
| Logo                  | `20px`    | `700 bold`  | `tight`     | "Kindar" na sidebar                 |

### Regras de Tipografia
- Headings sempre em `text-[#2C2C2C]` (dark)
- Body text em `text-[#5A6B6A]` ou `text-[#2C2C2C]`
- Textos de apoio/muted em `text-[#9CA3AF]` ou `text-[#7A8C8B]`
- Nunca ALL CAPS exceto labels de secao na sidebar (`uppercase tracking-wider`)
- Truncar nomes longos com `truncate` (especialmente em cards de crianca)

---

## 4. Componentes

### 4.1 Cards

```
+------------------------------------------+
|  [Icon]  Titulo do Card                  |
|                                          |
|  Conteudo do card com informacoes        |
|  relevantes e acoes disponiveis.         |
|                                          |
|  [Botao Secundario]   [Botao Primario]   |
+------------------------------------------+
```

**Especificacoes:**
- Border radius: `rounded-xl` (12px)
- Sombra: `shadow-sm` (0 1px 2px rgba(0,0,0,0.05))
- Background: `bg-white`
- Padding: `p-4` (16px) ou `p-5` (20px) para cards maiores
- Border opcional: `border border-gray-100`

**Variantes:**
| Variante        | Background       | Border              | Uso                         |
|-----------------|------------------|----------------------|-----------------------------|
| Default         | `bg-white`       | `border-gray-100`    | Cards de listagem           |
| Destaque        | `bg-[#E6F7F7]`  | nenhum               | Card de guarda hoje          |
| Alerta          | `bg-amber-50`    | `border-amber-200`   | Doencas ativas, alertas      |
| Hero            | gradiente custom | nenhum               | Card principal do dashboard  |

### 4.2 Botoes

| Variante     | Classes                                                        | Uso                              |
|--------------|----------------------------------------------------------------|----------------------------------|
| Primario     | `bg-[#5B9E85] text-white rounded-xl px-4 py-3 font-semibold`  | Acao principal (Salvar, Criar)   |
| Secundario   | `border border-gray-200 rounded-xl px-4 py-3 text-[#2C2C2C]` | Acao alternativa (Cancelar)       |
| Ghost        | `text-[#5B9E85] font-medium`                                  | Links de acao em linha            |
| Danger       | `bg-red-50 text-red-600 border border-red-200 rounded-xl`     | Acoes destrutivas (Excluir)       |
| Disabled     | `opacity-50 cursor-not-allowed`                                | Qualquer botao em estado inativo  |

**Dimensoes:**
- Altura minima: `44px` (target de toque acessivel)
- Largura minima em mobile: `full-width` para acoes primarias
- Padding horizontal: `px-4` (16px)
- Padding vertical: `py-3` (12px)

### 4.3 Tabs (Pill Style)

Usadas no perfil de crianca (4 abas), modulo de saude, chat.

```
[  Geral  ] [  Saude  ] [  Escola  ] [  Atividades  ]
   ativo      inativo     inativo       inativo
```

**Especificacoes:**
- Container: `flex gap-1 bg-gray-100 rounded-xl p-1`
- Tab ativa: `bg-white rounded-lg shadow-sm text-[#2C2C2C] font-semibold`
- Tab inativa: `text-[#7A8C8B]`
- Transicao: `transition-colors duration-200`

### 4.4 Inputs

| Propriedade     | Valor                                      |
|-----------------|---------------------------------------------|
| Border radius   | `rounded-lg` (8px)                          |
| Border          | `border-gray-200` (padrao), `border-[#5B9E85]` (focus) |
| Padding         | `px-3 py-2.5`                              |
| Font size       | `text-[14px]`                              |
| Label           | `text-[13px] font-medium text-[#2C2C2C] mb-1` |
| Placeholder     | `text-[#9CA3AF]`                            |
| Error state     | `border-red-400 bg-red-50`                  |
| Focus ring      | `ring-2 ring-[#5B9E85]/20 border-[#5B9E85]` |

### 4.5 Badges

| Variante     | Classes                                          | Uso                           |
|--------------|--------------------------------------------------|-------------------------------|
| Default      | `bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full` | Status neutro       |
| Primary      | `bg-[#E6F7F7] text-[#5B9E85]`                   | Status ativo                   |
| Warning      | `bg-amber-50 text-amber-700`                     | Atencao necessaria             |
| Error        | `bg-red-50 text-red-600`                          | Critico/urgente                |
| Success      | `bg-green-50 text-green-700`                      | Aprovado/concluido             |

### 4.6 Bottom Navigation (Mobile)

```
+----------------------------------------------------+
|   Home    Calendario    Chat    Familia    Mais     |
|    [o]       [o]        [o]      [o]       [o]     |
+----------------------------------------------------+
```

**Especificacoes:**
- Posicao: `fixed bottom-0` com `safe-area-bottom` (notch)
- Background: `bg-white/80 backdrop-blur-2xl`
- Border top: `border-t border-black/[0.04]` (sutil)
- Item ativo: `text-[#D4735A]`
- Item inativo: `text-[#9CA3AF]`
- Icone: `22px x 22px` SVG
- Label: `10px`
- Min touch target: `56px largura x 44px altura`

### 4.7 Sidebar (Desktop)

**Especificacoes:**
- Largura: `w-64` (256px)
- Background: `bg-white`
- Border: `border-r border-gray-100`
- Secoes com titulo: `10px bold uppercase tracking-wider text-[#9CA3AF]`
- Item ativo: `bg-[#D4735A]/[0.08] text-[#D4735A] rounded-xl`
- Item hover: `bg-[#FFF3E0]/50 text-[#2C2C2C]`
- Icones: `18px x 18px`, strokeWidth ativo=2, inativo=1.5
- Avatar no rodape: `36px` circulo `bg-[#2C2C2C]` com inicial branca

---

## 5. Grid e Espacamento

### Sistema de Espacamento (4px grid)

| Token    | Valor  | Uso                                    |
|----------|--------|----------------------------------------|
| `0.5`    | `2px`  | Micro gap (entre icone e label no nav) |
| `1`      | `4px`  | Padding minimo                         |
| `1.5`    | `6px`  | Gap entre itens compactos              |
| `2`      | `8px`  | Padding interno de inputs              |
| `3`      | `12px` | Padding de cards pequenos              |
| `4`      | `16px` | Padding padrao de cards, gap de grids  |
| `5`      | `20px` | Padding de cards grandes               |
| `6`      | `24px` | Margem de secoes, padding de pagina    |
| `8`      | `32px` | Espacamento entre secoes maiores       |

### Layout Responsivo

| Breakpoint | Largura    | Layout                                    |
|------------|------------|-------------------------------------------|
| Mobile     | `< 768px`  | BottomNav, stack vertical, full-width      |
| Tablet     | `768-1024` | Sidebar + conteudo (ResponsiveShell)       |
| Desktop    | `> 1024px` | Sidebar (256px) + conteudo centralizado    |

### Max Width de Conteudo
- Formularios: `max-w-lg` (512px)
- Paginas de listagem: `max-w-2xl` (672px)
- Dashboard: sem max-width (responsive grid)

---

## 6. Iconografia

### Padrao
- **Inline SVG** (sem biblioteca de icones externa)
- Viewbox: `0 0 24 24`
- Tamanhos: `18px` (sidebar), `22px` (BottomNav), `24px` (icones de pagina)
- Stroke: `currentColor`, `strokeLinecap="round"`, `strokeLinejoin="round"`
- StrokeWidth: `1.5` (normal), `2` (ativo/enfase)
- Fill: `none` (sempre outline style, nunca solid)

### Emojis como Icones de Categoria
Categorias usam emojis nativos em vez de SVGs para familiaridade:

| Categoria    | Emoji | Contexto              |
|-------------|-------|-----------------------|
| Educacao    | `🎓`  | Despesas, atividades  |
| Saude       | `🏥`  | Despesas, atividades  |
| Alimentacao | `🍔`  | Despesas              |
| Esporte     | `⚽`  | Atividades, check-in  |
| Musica      | `🎵`  | Atividades            |
| Terapia     | `🧠`  | Atividades            |
| PIX         | `💸`  | Liquidacao financeira |

---

## 7. Elevacao e Sombras

| Nivel     | Classes                  | Uso                              |
|-----------|--------------------------|----------------------------------|
| 0         | nenhum                   | Elementos inline                 |
| 1         | `shadow-sm`              | Cards padrao                     |
| 2         | `shadow-md`              | Dropdowns, popovers              |
| 3         | `shadow-lg`              | Modais, sheets                   |
| Blur      | `backdrop-blur-2xl`      | BottomNav, overlays              |

---

## 8. Principios de Design Emocional

### 8.1 Neutralidade
- Cores de responsaveis (teal/coral) sao atribuidas por **ordem de entrada**, nao por genero
- Nunca usar "pai" ou "mae" isoladamente - usar "responsaveis"
- Cards de guarda mostram informacao factual, sem julgamento

### 8.2 Calma em Momentos de Tensao
- Modais de troca de guarda: background suave, sem vermelho
- Alertas de saude: amarelo/ambar para atencao, nunca vermelho de panicoacao
- Chat com moderacao de tom: aviso suave antes de enviar mensagem agressiva

### 8.3 Transparencia
- Financeiro: sempre mostra quem pagou, split exato, saldo claro
- Decisoes: votacao visivel, historico transparente
- Calendario: ambos os responsaveis veem a mesma informacao

### 8.4 Acessibilidade
- `aria-label` em todos os icones de navegacao
- `aria-current="page"` no item ativo
- Contraste minimo WCAG 2.1 AA (4.5:1 para texto, 3:1 para elementos grandes)
- Touch targets minimo `44px x 44px`
- `role="navigation"` nos containers de navegacao
- `prefers-reduced-motion`: respeitar via transitions condicionais
- Labels de formulario explicitamente associados a inputs

---

## 9. Padroes de Layout de Pagina

### Pagina de Listagem
```
+-----------------------------------------+
|  Heading (22px bold)                    |
|  Descricao (13px muted)                |
|                                         |
|  [Tab 1] [Tab 2] [Tab 3]               |
|                                         |
|  +-----------------------------------+  |
|  | Card item 1                       |  |
|  +-----------------------------------+  |
|  +-----------------------------------+  |
|  | Card item 2                       |  |
|  +-----------------------------------+  |
|                                         |
|  [+ Botao Adicionar]                    |
+-----------------------------------------+
```

### Pagina de Formulario
```
+-----------------------------------------+
|  < Voltar                               |
|  Heading (22px bold)                    |
|                                         |
|  Label                                  |
|  [Input________________________]        |
|                                         |
|  Label                                  |
|  [Select_______________________]        |
|                                         |
|  Label                                  |
|  [Textarea_____________________]        |
|  [_____________________________]        |
|                                         |
|  [====== Salvar (full-width) ======]    |
+-----------------------------------------+
```

### Dashboard
```
+-----------------------------------------+
|  Ola, [Nome]! (hero card)               |
|  [Guarda hoje] [Proxima troca]          |
|                                         |
|  Semana  [S][T][Q][Q][S][S][D]          |
|                                         |
|  +-- Alertas Saude ---+-- Atividades --+|
|  |  Doenca ativa      |  Natacao 14h   ||
|  |  Medicamento       |  Terapia 16h   ||
|  +--------------------+-----------------+|
|                                         |
|  +-- Financeiro ------+-- Decisoes ----+|
|  |  Saldo: R$ 150     |  2 pendentes   ||
|  +--------------------+-----------------+|
+-----------------------------------------+
```

---

## 10. Tokens de Animacao

| Propriedade     | Valor         | Uso                              |
|-----------------|---------------|----------------------------------|
| Duracao padrao  | `200ms`       | Transicoes de cor, hover          |
| Duracao media   | `300ms`       | Abertura de modais, sheets        |
| Easing          | `ease-in-out` | Padrao para todas as transicoes   |
| Skeleton        | `animate-pulse`| Loading states                   |

---

*Este design system e um documento vivo e deve ser atualizado conforme o produto evolui.*
