# POLITICA DE COOKIES DA PLATAFORMA KINDAR

**Versao:** 1.0
**Data de vigencia:** [DATA DE VIGENCIA]
**Ultima atualizacao:** [DATA DE VIGENCIA]

---

## IDENTIFICACAO DO CONTROLADOR

**Razao Social:** [RAZAO SOCIAL]
**CNPJ:** [XX.XXX.XXX/XXXX-XX]
**E-mail de contato:** contato@kindar.com.br
**E-mail de privacidade:** privacidade@kindar.com.br
**Website:** https://kindar.com.br

---

## 1. O QUE SAO COOKIES?

1.1. Cookies sao pequenos arquivos de texto armazenados no navegador ou dispositivo do Usuario quando este acessa um site ou aplicacao web. Os cookies permitem que a aplicacao reconheca o dispositivo do Usuario e armazene informacoes sobre suas preferencias ou acoes anteriores.

1.2. A Plataforma Kindar utiliza cookies e tecnologias similares (como armazenamento local -- localStorage e sessionStorage) para garantir o funcionamento adequado de suas funcionalidades, melhorar a experiencia do Usuario e, quando autorizado, analisar o uso da Plataforma.

---

## 2. CATEGORIAS DE COOKIES UTILIZADOS

### 2.1. Cookies Essenciais (Necessarios)

Estes cookies sao indispensaveis para o funcionamento basico da Plataforma. Sem eles, funcionalidades essenciais como autenticacao e navegacao nao funcionariam. **Nao requerem consentimento previo**, pois sao estritamente necessarios para a prestacao do servico.

| Cookie/Tecnologia | Finalidade | Duracao | Provedor |
|-------------------|-----------|---------|----------|
| Token de sessao (Supabase Auth) | Autenticacao do Usuario e manutencao da sessao logada | Ate o logout ou expiracao da sessao | Supabase |
| Refresh token | Renovacao automatica da sessao sem necessidade de novo login | Conforme configuracao de seguranca | Supabase |
| CSRF token | Protecao contra ataques de falsificacao de requisicao entre sites | Sessao | Kindar |

**Base legal:** Execucao de contrato (Art. 7, V, LGPD) e necessidade tecnica para prestacao do servico.

### 2.2. Cookies Funcionais

Estes cookies armazenam preferencias do Usuario para personalizar a experiencia na Plataforma. A Plataforma funciona sem eles, mas a experiencia pode ser degradada.

| Cookie/Tecnologia | Finalidade | Duracao | Provedor |
|-------------------|-----------|---------|----------|
| Preferencia de idioma | Armazenar o idioma selecionado pelo Usuario (portugues/ingles) | 1 ano | Kindar |
| Preferencia de tema | Armazenar preferencia de tema visual (claro/escuro), se aplicavel | 1 ano | Kindar |
| Preferencia de notificacoes | Registro da escolha do Usuario sobre notificacoes push | Persistente | Kindar |
| Grupo familiar ativo | Armazenar qual grupo familiar esta selecionado (para usuarios com multiplos grupos) | Sessao | Kindar |

**Base legal:** Execucao de contrato (Art. 7, V, LGPD) -- necessarios para o funcionamento adequado das funcionalidades contratadas.

### 2.3. Cookies Analiticos

Estes cookies coletam informacoes anonimizadas sobre como os Usuarios interagem com a Plataforma, permitindo identificar areas de melhoria. **Requerem consentimento previo do Usuario.**

| Cookie/Tecnologia | Finalidade | Duracao | Provedor |
|-------------------|-----------|---------|----------|
| PostHog analytics | Analise de uso anonimizada: paginas visitadas, fluxos de navegacao, funcionalidades utilizadas | Conforme configuracao | PostHog Inc. |

**Base legal:** Consentimento (Art. 7, I, LGPD).

**Dados coletados pelo PostHog (quando autorizado):**
- Paginas visitadas e tempo de permanencia (anonimizado);
- Fluxos de navegacao e interacoes com funcionalidades (anonimizado);
- Tipo de dispositivo e navegador (anonimizado);
- Pais de origem (anonimizado, sem geolocalizacao precisa).

**Dados NAO coletados pelo PostHog:**
- Dados pessoais identificaveis;
- Conteudo de mensagens, dados de saude ou financeiros;
- Nomes, e-mails ou qualquer informacao das criancas.

> [REVISAR COM ADVOGADO] -- Verificar se a implementacao do PostHog esta adequada as exigencias da LGPD, incluindo: (1) local de armazenamento dos dados analiticos; (2) existencia de DPA (Data Processing Agreement) com o PostHog; (3) transferencia internacional de dados analiticos.

---

## 3. COOKIES DE TERCEIROS

3.1. A Plataforma **nao utiliza** cookies de terceiros para fins publicitarios, de marketing ou de rastreamento entre sites.

3.2. Os unicos cookies de terceiros eventualmente presentes sao:

   a) **Supabase:** cookies tecnicos necessarios para autenticacao;

   b) **PostHog:** cookies analiticos (somente com consentimento).

3.3. A Kindar nao permite que redes de publicidade, redes sociais ou outros terceiros instalem cookies de rastreamento em sua Plataforma.

---

## 4. COMO GERENCIAR COOKIES

### 4.1. Banner de Consentimento

4.1.1. Ao acessar a Plataforma pela primeira vez, o Usuario sera apresentado a um banner de consentimento de cookies, onde podera:

   a) **Aceitar todos os cookies:** incluindo cookies analiticos;

   b) **Aceitar apenas os necessarios:** somente cookies essenciais e funcionais;

   c) **Gerenciar preferencias:** escolher individualmente quais categorias de cookies deseja autorizar.

4.1.2. O Usuario podera alterar suas preferencias de cookies a qualquer momento por meio de [DESCREVER MECANISMO -- ex.: link "Configuracoes de Cookies" no rodape da Plataforma ou nas configuracoes de perfil].

> [REVISAR COM ADVOGADO] -- Implementar mecanismo de gerenciamento de cookies conforme orientacoes da ANPD. Verificar se o modelo de consentimento por banner e suficiente ou se e necessario implementar CMP (Consent Management Platform).

### 4.2. Configuracoes do Navegador

4.2.1. O Usuario tambem pode gerenciar cookies por meio das configuracoes de seu navegador. A maioria dos navegadores permite:

   - Visualizar os cookies armazenados;
   - Excluir cookies especificos ou todos os cookies;
   - Bloquear cookies de terceiros;
   - Configurar alertas quando cookies sao definidos;
   - Bloquear todos os cookies (o que podera impedir o funcionamento da Plataforma).

4.2.2. Instrucoes para gerenciamento de cookies nos principais navegadores:

   - **Google Chrome:** Configuracoes > Privacidade e seguranca > Cookies e outros dados de sites
   - **Mozilla Firefox:** Configuracoes > Privacidade e Seguranca > Cookies e dados de sites
   - **Safari:** Preferencias > Privacidade > Gerenciar dados do site
   - **Microsoft Edge:** Configuracoes > Cookies e permissoes do site > Cookies e dados armazenados

4.2.3. **Aviso importante:** A desativacao de cookies essenciais podera comprometer o funcionamento da Plataforma, impedindo a autenticacao e o acesso as funcionalidades.

### 4.3. Recusa de Cookies Analiticos

4.3.1. O Usuario pode recusar cookies analiticos sem qualquer prejuizo ao funcionamento da Plataforma. Todas as funcionalidades permanecem disponiveis independentemente da aceitacao de cookies analiticos.

4.3.2. Caso o Usuario recuse os cookies analiticos e posteriormente deseje autoriza-los, podera faze-lo por meio do mecanismo de gerenciamento de preferencias descrito no item 4.1.2.

---

## 5. ARMAZENAMENTO LOCAL (LOCALSTORAGE E SESSIONSTORAGE)

5.1. Alem de cookies, a Plataforma utiliza tecnologias de armazenamento local do navegador:

| Tecnologia | Finalidade | Duracao |
|-----------|-----------|---------|
| localStorage | Armazenamento de preferencias persistentes (idioma, tema, grupo ativo) | Ate exclusao manual pelo Usuario |
| sessionStorage | Dados temporarios de navegacao (estado de formularios em andamento) | Ate o fechamento da aba do navegador |

5.2. O armazenamento local nao e transmitido automaticamente ao servidor a cada requisicao (diferentemente dos cookies) e e utilizado exclusivamente no dispositivo do Usuario.

---

## 6. SERVICE WORKER E CACHE

6.1. A Plataforma Kindar, sendo uma Progressive Web App (PWA), utiliza Service Worker para:

   a) Permitir o funcionamento offline de funcionalidades basicas;

   b) Armazenar em cache recursos estaticos (imagens, scripts, estilos) para melhorar o desempenho;

   c) Gerenciar notificacoes push (quando autorizadas pelo Usuario).

6.2. O cache do Service Worker pode ser limpo pelo Usuario por meio das configuracoes de seu navegador ou pela desinstalacao do PWA.

---

## 7. RETENCAO DE DADOS DE COOKIES

7.1. Os periodos de retencao dos cookies estao indicados nas tabelas da Secao 2.

7.2. Cookies de sessao sao automaticamente excluidos quando o Usuario encerra sua sessao (logout) ou fecha o navegador.

7.3. Cookies persistentes sao mantidos ate sua data de expiracao ou ate serem excluidos pelo Usuario.

---

## 8. ATUALIZACOES NESTA POLITICA

8.1. A Kindar podera atualizar esta Politica de Cookies periodicamente, sendo que alteracoes substanciais serao comunicadas ao Usuario por meio de aviso na Plataforma.

8.2. A versao atualizada sempre estara disponivel em https://kindar.com.br/cookies.

---

## 9. CONTATO

Para duvidas sobre esta Politica de Cookies ou sobre o uso de cookies na Plataforma:

- **E-mail geral:** contato@kindar.com.br
- **E-mail de privacidade:** privacidade@kindar.com.br
- **Encarregado de Protecao de Dados:** [NOME DO ENCARREGADO] -- privacidade@kindar.com.br

---

**[CIDADE/UF], [DATA DE VIGENCIA]**

**[RAZAO SOCIAL]**
**CNPJ: [XX.XXX.XXX/XXXX-XX]**

---

> **NOTA PARA O ADVOGADO:** Este documento deve ser revisado em conjunto com a Politica de Privacidade. Verificar: (1) adequacao do modelo de consentimento de cookies conforme orientacoes da ANPD; (2) necessidade de DPA com o PostHog; (3) conformidade do banner de cookies com as melhores praticas de privacidade; (4) verificar se todas as tecnologias de rastreamento utilizadas estao listadas.
