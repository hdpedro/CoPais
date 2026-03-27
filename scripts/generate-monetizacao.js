const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak
} = require("docx");

const DARK = "1A3B3A";
const ORANGE = "E8734A";
const L_GREEN = "E8F5E9";
const L_ORANGE = "FFF3E0";
const L_RED = "FFEBEE";
const L_BLUE = "E3F2FD";
const L_GRAY = "F5F5F5";
const GRAY = "E0E0E0";
const W = "FFFFFF";
const TW = 9360;

const bd = { style: BorderStyle.SINGLE, size: 1, color: GRAY };
const bds = { top: bd, bottom: bd, left: bd, right: bd };
const cm = { top: 80, bottom: 80, left: 120, right: 120 };

const hc = (t, w) => new TableCell({ borders: bds, width: { size: w, type: WidthType.DXA }, shading: { fill: DARK, type: ShadingType.CLEAR }, margins: cm, children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: W, font: "Arial", size: 20 })] })] });
const dc = (t, w, o = {}) => new TableCell({ borders: bds, width: { size: w, type: WidthType.DXA }, shading: { fill: o.f || W, type: ShadingType.CLEAR }, margins: cm, children: [new Paragraph({ children: [new TextRun({ text: t, bold: o.b || false, color: o.c || "333333", font: "Arial", size: 20 })] })] });

const st = (n, t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 }, children: [new TextRun({ text: `${n}. `, bold: true, color: ORANGE, font: "Arial", size: 32 }), new TextRun({ text: t, bold: true, color: DARK, font: "Arial", size: 32 })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 }, children: [new TextRun({ text: t, bold: true, color: DARK, font: "Arial", size: 26 })] });
const bt = (t, o = {}) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t, font: "Arial", size: 22, color: "333333", bold: o.b || false })] });
const bi = (t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: t, font: "Arial", size: 20, color: "333333" })] });
const el = () => new Paragraph({ spacing: { after: 100 }, children: [] });
const div = () => new Paragraph({ spacing: { before: 200, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GRAY, space: 8 } }, children: [] });
const alert = (t, fill) => new Paragraph({ spacing: { after: 120 }, shading: { fill, type: ShadingType.CLEAR }, children: [new TextRun({ text: `  ${t}`, font: "Arial", size: 20, bold: true, color: DARK })] });
const pb = () => new Paragraph({ children: [new PageBreak()] });

const doc = new Document({
  styles: { default: { document: { run: { font: "Arial", size: 22 } } }, paragraphStyles: [
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: "Arial", color: DARK }, paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
    { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Arial", color: DARK }, paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } },
  ] },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
  sections: [
    // COVER
    { properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        el(), el(), el(), el(), el(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Kindar", bold: true, color: DARK, font: "Arial", size: 72 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ORANGE, space: 12 } }, children: [new TextRun({ text: "Coparentalidade Inteligente", color: ORANGE, font: "Arial", size: 32 })] }),
        el(), el(), el(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "Estrategia de Monetizacao", bold: true, color: DARK, font: "Arial", size: 40 })] }),
        el(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "Documento corrigido e validado.", color: "666666", font: "Arial", size: 22 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "Versao realista para tomada de decisao.", color: "666666", font: "Arial", size: 22 })] }),
        el(), el(), el(), el(),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Marco/2026", color: "999999", font: "Arial", size: 20 })] }),
        pb(),
      ],
    },
    // CONTENT
    { properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: DARK, space: 4 } }, children: [new TextRun({ text: "Kindar", bold: true, color: DARK, font: "Arial", size: 18 }), new TextRun({ text: "  |  Estrategia de Monetizacao", color: "999999", font: "Arial", size: 18 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Pagina ", color: "999999", font: "Arial", size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: "999999", font: "Arial", size: 16 })] })] }) },
      children: [
        // S1
        st("1", "TAXAS DAS LOJAS"),
        el(),
        new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [2000, 2000, 2680, 2680],
          rows: [
            new TableRow({ children: [hc("Loja", 2000), hc("Taxa padrao", 2000), hc("Startup (<US$1M)", 2680), hc("Apos 1 ano", 2680)] }),
            new TableRow({ children: [dc("Apple", 2000, { b: true }), dc("30%", 2000), dc("15% (Small Business)", 2680, { c: "4CAF50", b: true }), dc("15%", 2680)] }),
            new TableRow({ children: [dc("Google", 2000, { b: true, f: L_GRAY }), dc("30%", 2000, { f: L_GRAY }), dc("15% (baseline seguro)", 2680, { c: "4CAF50", b: true, f: L_GRAY }), dc("15%", 2680, { f: L_GRAY })] }),
          ],
        }),
        el(),
        alert("Google 10% existe em casos especificos. Use 15% como base segura para projecoes.", L_ORANGE),
        div(),

        // S2
        st("2", "CADE / APPLE NO BRASIL"),
        bt("O que esta acontecendo:", { b: true }),
        bi("Apple sendo pressionada pelo CADE e decisoes globais"),
        bi("Flexibilizacoes em andamento"),
        bi("Acordo preve possibilidade de pagamentos externos"),
        el(),
        alert("O que NAO assumir no planejamento:", L_RED),
        bi("NAO e totalmente livre colocar pagamento externo sem regras"),
        bi("Pode haver comissao residual (3% a 27%)"),
        bi("Restricoes de UX podem ser impostas pela Apple"),
        bi("Necessidade de entitlement/aprovacao da Apple"),
        el(),
        alert("Como tratar: Possibilidade emergente, sujeita a regras. Considerar como oportunidade futura, nao como garantia.", L_GREEN),
        bt("Na pratica: Planejar com IAP (15%) como cenario base. Se a abertura se confirmar, sera um bonus de margem."),
        div(),

        // S3
        st("3", "PIX AUTOMATICO — Realidade vs Hype"),
        bt("O que e verdade:", { b: true }),
        bi("Taxa baixa (~1-2%)"),
        bi("Alta penetracao no Brasil"),
        bi("Sem chargeback"),
        bi("Fit perfeito para app de familias (rotina, previsibilidade)"),
        bi("Atinge brasileiros sem cartao de credito"),
        el(),
        alert("O que NAO usar como projecao:", L_RED),
        bi("\"Crescimento de 41% ao mes\" e dado de early stage, nao sustentavel"),
        bi("Nao usar como base de projecao financeira"),
        el(),
        alert("PIX Automatico e arma competitiva real, mas projetar receita com IAP (cenario conservador).", L_GREEN),
        div(),

        // S4
        st("4", "CONVERSAO DE TRIAL — Expectativas Realistas"),
        el(),
        new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [4680, 4680],
          rows: [
            new TableRow({ children: [hc("Faixa", 4680), hc("Conversao", 4680)] }),
            new TableRow({ children: [dc("Comum", 4680), dc("5% - 15%", 4680)] }),
            new TableRow({ children: [dc("Excelente", 4680, { f: L_GRAY }), dc("15% - 20%", 4680, { f: L_GRAY, c: "4CAF50", b: true })] }),
            new TableRow({ children: [dc("Excepcional", 4680), dc("20% - 30%", 4680, { c: "4CAF50", b: true })] }),
            new TableRow({ children: [dc("Top 1%", 4680, { f: L_GRAY }), dc("30%+", 4680, { f: L_GRAY })] }),
          ],
        }),
        el(),
        alert("Para o Kindar, esperar 10-20% no inicio. Melhorar com iteracoes.", L_BLUE),
        el(),
        bt("Sobre trial sem cartao:", { b: true }),
        bi("Melhor para Brasil (muitos sem cartao)"),
        bi("iOS pode exigir metodo de pagamento via IAP"),
        bi("Conversao pode ser menor vs trial com cartao"),
        bi("Precisa ser TESTADO, nao assumido"),
        div(),

        pb(),

        // S5
        st("5", "ESTRATEGIA CORRIGIDA — 3 Fases"),
        el(),
        h2("Fase 1 — Lancamento (validacao)"),
        bt("Apenas o essencial:", { b: true }),
        bi("Apple IAP + Google IAP"),
        bi("RevenueCat (gratis ate US$ 2.500/mes)"),
        bi("Preco: R$ 19,90/mes"),
        el(),
        bt("Por que apenas isso:", { b: true }),
        bi("Menos friccao para aprovacao nas lojas"),
        bi("Mais rapido para ir ao ar"),
        bi("Foco em validar o produto, nao em otimizar margem"),
        el(),

        h2("Fase 2 — Otimizacao (apos PMF validado)"),
        bt("Adiciona:", { b: true }),
        bi("Stripe Brasil (web checkout)"),
        bi("PIX como opcao de pagamento"),
        bi("Landing page externa com checkout"),
        bi("Preco: R$ 24,90/mes"),
        el(),
        bt("Estrategia:", { b: true }),
        bi("Usuario entra no app → ve valor → faz upgrade"),
        bi("Direciona para web para pagamento (taxa menor)"),
        bi("Mantem IAP como opcao de conveniencia"),
        el(),

        h2("Fase 3 — Otimizacao agressiva de margem"),
        bt("Incentiva PIX:", { b: true }),
        bi("Desconto para quem paga via PIX (ex: R$ 24,90 → R$ 19,90)"),
        bi("Beneficios extras para assinantes PIX"),
        bi("PIX Automatico para recorrencia"),
        bi("Preco: R$ 24,90 - R$ 29,90/mes"),
        el(),
        alert("O jogo: trocar margem por conversao inteligente. Desconto no PIX custa menos que a taxa da Apple.", L_GREEN),
        div(),

        // S6
        st("6", "ARQUITETURA FINAL"),
        el(),
        new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [2500, 4360, 2500],
          rows: [
            new TableRow({ children: [hc("Camada", 2500), hc("Ferramenta", 4360), hc("Taxa", 2500)] }),
            new TableRow({ children: [dc("Gestao", 2500, { b: true }), dc("RevenueCat", 4360), dc("Gratis", 2500, { c: "4CAF50", b: true })] }),
            new TableRow({ children: [dc("Conveniencia", 2500, { b: true, f: L_GRAY }), dc("IAP Apple/Google", 4360, { f: L_GRAY }), dc("15%", 2500, { f: L_GRAY })] }),
            new TableRow({ children: [dc("Margem", 2500, { b: true }), dc("Stripe Brasil (PIX/Web)", 4360), dc("1-4%", 2500, { c: "4CAF50", b: true })] }),
          ],
        }),
        div(),

        // S7
        st("7", "PROJECOES CONSERVADORAS"),
        bt("Com 1.000 familias pagantes a R$ 19,90/mes:", { b: true }),
        el(),
        new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [1800, 2000, 2000, 1780, 1780],
          rows: [
            new TableRow({ children: [hc("Cenario", 1800), hc("Mix", 2000), hc("Receita bruta", 2000), hc("Taxa", 1780), hc("Liquida", 1780)] }),
            new TableRow({ children: [dc("Conservador", 1800, { b: true }), dc("100% IAP", 2000), dc("R$ 19.900", 2000), dc("15%", 1780), dc("R$ 16.915", 1780, { c: "4CAF50", b: true })] }),
            new TableRow({ children: [dc("Realista", 1800, { b: true, f: L_GRAY }), dc("60% IAP + 40% PIX", 2000, { f: L_GRAY }), dc("R$ 19.900", 2000, { f: L_GRAY }), dc("~10%", 1780, { f: L_GRAY }), dc("R$ 17.910", 1780, { c: "4CAF50", b: true, f: L_GRAY })] }),
            new TableRow({ children: [dc("Otimista", 1800, { b: true }), dc("30% IAP + 70% PIX", 2000), dc("R$ 19.900", 2000), dc("~6%", 1780), dc("R$ 18.706", 1780, { c: "4CAF50", b: true })] }),
          ],
        }),
        el(),
        bt("Conversao de trial (cenario realista):", { b: true }),
        el(),
        new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [2800, 2186, 2187, 2187],
          rows: [
            new TableRow({ children: [hc("Metrica", 2800), hc("Conservador", 2186), hc("Realista", 2187), hc("Otimista", 2187)] }),
            new TableRow({ children: [dc("Downloads/mes", 2800, { b: true }), dc("1.000", 2186), dc("1.000", 2187), dc("1.000", 2187)] }),
            new TableRow({ children: [dc("Ativam trial", 2800, { b: true, f: L_GRAY }), dc("30% = 300", 2186, { f: L_GRAY }), dc("40% = 400", 2187, { f: L_GRAY }), dc("50% = 500", 2187, { f: L_GRAY })] }),
            new TableRow({ children: [dc("Convertem p/ pago", 2800, { b: true }), dc("10% = 30", 2186), dc("15% = 60", 2187), dc("20% = 100", 2187)] }),
            new TableRow({ children: [dc("Novos pagantes/mes", 2800, { b: true, f: L_GREEN }), dc("30", 2186, { b: true, f: L_GREEN }), dc("60", 2187, { b: true, c: "4CAF50", f: L_GREEN }), dc("100", 2187, { b: true, c: "4CAF50", f: L_GREEN })] }),
          ],
        }),
        el(),
        alert("Para 1.000 pagantes no cenario realista: ~17 meses.", L_BLUE),
        div(),

        pb(),

        // S8
        st("8", "PRECO RECOMENDADO"),
        el(),
        new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [2000, 3680, 3680],
          rows: [
            new TableRow({ children: [hc("Faixa", 2000), hc("Valor", 3680), hc("Quando", 3680)] }),
            new TableRow({ children: [dc("Entrada", 2000, { b: true }), dc("R$ 19,90/mes", 3680, { c: "4CAF50", b: true }), dc("Lancamento", 3680)] }),
            new TableRow({ children: [dc("Padrao", 2000, { b: true, f: L_GRAY }), dc("R$ 24,90/mes", 3680, { f: L_GRAY, b: true }), dc("Apos validacao", 3680, { f: L_GRAY })] }),
            new TableRow({ children: [dc("Premium", 2000, { b: true }), dc("R$ 29,90/mes", 3680, { b: true }), dc("Com features diferenciadas", 3680)] }),
          ],
        }),
        el(),
        alert("Comeca em R$ 19,90. Sobe depois. Prioridade e base de usuarios.", L_GREEN),
        el(),
        bt("Plano anual com desconto:", { b: true }),
        bi("R$ 19,90/mes → R$ 189,90/ano (R$ 15,83/mes — 20% off)"),
        bi("Incentiva retencao e previsibilidade de receita"),
        div(),

        // S9
        st("9", "VISAO DE FUTURO"),
        el(),
        alert("Vantagem absurda do Kindar: Problema recorrente + emocional + obrigatorio", L_GREEN),
        el(),
        bt("Pais separados PRECISAM se comunicar sobre os filhos. Nao e opcional. Isso gera:"),
        bi("Retencao altissima (churn baixo)"),
        bi("Uso diario/semanal garantido"),
        bi("Disposicao a pagar por algo que reduz conflito"),
        el(),
        bt("Evolucao possivel:", { b: true }),
        el(),
        new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [2000, 3680, 3680],
          rows: [
            new TableRow({ children: [hc("Fase", 2000), hc("Modelo", 3680), hc("Receita adicional", 3680)] }),
            new TableRow({ children: [dc("Atual", 2000, { b: true }), dc("SaaS (assinatura)", 3680), dc("Core business", 3680)] }),
            new TableRow({ children: [dc("Futura", 2000, { b: true, f: L_GRAY }), dc("Marketplace de servicos (advogados, mediadores)", 3680, { f: L_GRAY }), dc("Comissao por conexao", 3680, { f: L_GRAY })] }),
            new TableRow({ children: [dc("Futura", 2000, { b: true }), dc("Fintech leve (split de despesas, pensao)", 3680), dc("Taxa sobre transacoes", 3680)] }),
            new TableRow({ children: [dc("Futura", 2000, { b: true, f: L_GRAY }), dc("Juridico (acordos digitais)", 3680, { f: L_GRAY }), dc("Parceria com escritorios", 3680, { f: L_GRAY })] }),
          ],
        }),
        el(),
        alert("SaaS + Fintech leve e onde esta o dinheiro de verdade.", L_GREEN),
        div(),

        // S10
        st("10", "RESUMO EXECUTIVO"),
        el(),
        new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [4000, 5360],
          rows: [
            new TableRow({ children: [hc("Item", 4000), hc("Decisao", 5360)] }),
            new TableRow({ children: [dc("Preco inicial", 4000, { b: true }), dc("R$ 19,90/mes", 5360, { c: "4CAF50", b: true })] }),
            new TableRow({ children: [dc("Modelo", 4000, { b: true, f: L_GRAY }), dc("Freemium + Trial 7 dias", 5360, { f: L_GRAY })] }),
            new TableRow({ children: [dc("Pagamento Fase 1", 4000, { b: true }), dc("IAP (Apple/Google) via RevenueCat", 5360)] }),
            new TableRow({ children: [dc("Pagamento Fase 2", 4000, { b: true, f: L_GRAY }), dc("+ Stripe/PIX (web)", 5360, { f: L_GRAY })] }),
            new TableRow({ children: [dc("Pagamento Fase 3", 4000, { b: true }), dc("+ PIX Automatico + incentivos", 5360)] }),
            new TableRow({ children: [dc("Conversao esperada", 4000, { b: true, f: L_GRAY }), dc("10-20% (realista)", 5360, { f: L_GRAY })] }),
            new TableRow({ children: [dc("Meta 1.000 pagantes", 4000, { b: true }), dc("12-18 meses", 5360)] }),
            new TableRow({ children: [dc("Custo infra ate la", 4000, { b: true, f: L_GRAY }), dc("R$ 0 - R$ 250/mes", 5360, { f: L_GRAY })] }),
            new TableRow({ children: [dc("Taxa media sobre receita", 4000, { b: true }), dc("10-15%", 5360)] }),
          ],
        }),
        el(), el(),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Documento atualizado em Marco/2026  |  Validado com analise de mercado real", color: "999999", font: "Arial", size: 18, italics: true })] }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync("MONETIZACAO.docx", buf); console.log("MONETIZACAO.docx criado!"); });
