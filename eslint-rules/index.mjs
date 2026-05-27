/**
 * Local ESLint plugin for Kindar-specific rules.
 *
 * Why local: each rule encodes a Regra Canônica (see DEV/docs/03-architecture/
 * REGRAS_CANONICAS.md) and is too project-specific for a published plugin.
 *
 * Wired in eslint.config.mjs via `plugins: { kindar: kindarPlugin }`.
 */
import noPtLiteral from "./no-pt-literal.mjs";
import apiRouteAuthHelper from "./api-route-auth-helper.mjs";

export default {
  rules: {
    "no-pt-literal": noPtLiteral,
    "api-route-auth-helper": apiRouteAuthHelper,
  },
};
