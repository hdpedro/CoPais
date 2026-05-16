/**
 * kindar/no-pt-literal — enforces Regra Canônica 2 in code.
 *
 * Flags Portuguese literal strings in JSX text and i18n-sensitive attributes:
 *   placeholder, title, alt, aria-label, accessibilityLabel, accessibilityHint.
 *
 * Detection is heuristic (the rule cannot statically prove a string is "user-
 * visible Portuguese" without a parser of natural language):
 *   - Must contain a pt accent (á à â ã é ê í ó ô õ ú ç + uppercase) OR a
 *     filler pt word (de/da/do/para/com/você/sua/seu/sem/etc.).
 *   - JSX text or relevant attribute literal of length ≥ 4.
 *
 * Bypass with `// i18n-ignore-line` on the same line, or wrap a block in
 * `i18n-ignore-block-start` / `i18n-ignore-block-end` comments. Used for
 * legal copy in /termos and /privacidade where Regra 14 keeps pt fixed
 * until human/jurídico review.
 *
 * Started as `warn` (NOT `error`) because the codebase has ~400 existing
 * offenders. Promotion to `error` happens in a follow-up after cleanup PR.
 *
 * Auto-fix: not implemented — replacement requires a new i18n key, which
 * involves choosing a name and translating to 5 locales. Always manual.
 */

const PT_ACCENTS = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;
const PT_FILLERS =
  /\b(de|da|do|para|com|você|sua|seu|sem|nao|aqui|hoje|amanhã|amanha|sim|criança|crianca|família|familia|guarda)\b/i;

const I18N_ATTRS = new Set([
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "ariaLabel",
  "accessibilityLabel",
  "accessibilityHint",
  "accessibilityValue",
  "label",
]);

function looksPortuguese(text) {
  if (!text || text.length < 4) return false;
  if (/^[\d\s.,/\-+:%R$€£¥*]+$/.test(text)) return false;
  if (/^[a-z0-9-_/.]+$/.test(text)) return false;
  return PT_ACCENTS.test(text) || PT_FILLERS.test(text);
}

function nodeHasIgnoreComment(node, sourceCode) {
  const comments = sourceCode.getCommentsBefore(node);
  for (const c of comments) {
    if (c.value.includes("i18n-ignore-line") || c.value.includes("i18n-ignore-block-start")) {
      return true;
    }
  }
  const all = sourceCode.getAllComments();
  const start = node.loc && node.loc.start && node.loc.start.line;
  for (const c of all) {
    if (c.loc.end.line === start && c.value.includes("i18n-ignore-line")) return true;
  }
  return false;
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow Portuguese literal strings in JSX text and i18n-sensitive attributes. Use t() instead.",
      recommended: true,
    },
    schema: [],
    messages: {
      jsxText:
        'Portuguese literal in JSX: "{{snippet}}". Replace with {t("namespace.key")} and add the key to src/i18n/locales/*.json. (Regra Canônica 2)',
      attrText:
        'Portuguese literal in `{{attr}}` attribute: "{{snippet}}". Replace with {t("namespace.key")} and add the key to all 5 locales. (Regra Canônica 2)',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    function inIgnoreBlock(node) {
      const all = sourceCode.getAllComments();
      const line = (node.loc && node.loc.start && node.loc.start.line) || -1;
      let blockOpen = false;
      for (const c of all) {
        if (c.loc.start.line > line) break;
        if (c.value.includes("i18n-ignore-block-start")) blockOpen = true;
        if (c.value.includes("i18n-ignore-block-end")) blockOpen = false;
      }
      return blockOpen;
    }

    return {
      JSXText(node) {
        const text = (node.value || "").trim();
        if (!looksPortuguese(text)) return;
        if (nodeHasIgnoreComment(node, sourceCode)) return;
        if (inIgnoreBlock(node)) return;
        context.report({
          node,
          messageId: "jsxText",
          data: { snippet: text.slice(0, 60) },
        });
      },
      JSXAttribute(node) {
        const name = node.name && (node.name.name || node.name.value);
        if (!name || !I18N_ATTRS.has(String(name))) return;
        const v = node.value;
        if (!v) return;
        let text = null;
        if (v.type === "Literal" && typeof v.value === "string") {
          text = v.value;
        } else if (v.type === "JSXExpressionContainer") {
          const exp = v.expression;
          if (exp && exp.type === "Literal" && typeof exp.value === "string") {
            text = exp.value;
          }
        }
        if (!text || !looksPortuguese(text)) return;
        if (nodeHasIgnoreComment(node, sourceCode)) return;
        if (inIgnoreBlock(node)) return;
        context.report({
          node: v,
          messageId: "attrText",
          data: { attr: String(name), snippet: text.slice(0, 60) },
        });
      },
    };
  },
};
