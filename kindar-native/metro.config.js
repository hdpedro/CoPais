/**
 * Metro config — workaround pra bug do EAS Build worker no EAGER_BUNDLE.
 *
 * BUG: builds production iOS no EAS falham consistentemente desde 2026-05-05
 * (build #52) com erro `Unable to resolve module ../../src/<x> from
 * app/(tabs)/<arquivo>.tsx`. Bundle local com o MESMO comando
 * (`npx expo export:embed --eager --platform ios --dev false`) funciona
 * perfeitamente — 1919 modules bundled. EAS para em ~1123 modules ao
 * processar arquivos em (tabs)/ que importam `../../src/...`.
 *
 * Ja foram tentados sem sucesso:
 * 1. Cópia local de tokens em (tabs)/_tokens.ts (commit fd0a232)
 * 2. Alias `@/` -> src via resolveRequest (commit 08def0b)
 * 3. Mover screens pra app/_screens/ + stubs (commit b77f43c)
 *
 * NOVO WORKAROUND: configurar `extraNodeModules` pra Metro tratar `src`
 * como se fosse um pacote node_modules. Combinado com mudanca dos
 * imports em (tabs)/*.tsx pra usar 'src/...' (sem ../) em vez de
 * '../../src/...'. Isso evita o bug do resolver com paths relativos
 * cruzando a pasta de parenteses.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// CAUSA RAIZ DO BUG EAS (descoberta em build #66/#67 com diagnostic ls):
// EAS upload mantem APENAS `app/` e `assets/` populados no worker. Toda
// outra pasta (incluindo `src/`) chega VAZIA. Heuristica do upload ignora
// folders nao-canonicos do Expo. Por isso movemos `src/` -> `app/_src/`
// (commit ?) — agora vai junto no upload do `app/`.
//
// extraNodeModules.src aponta pra novo local. Imports estilo modulo
// `import 'src/lib/X'` resolvem pra app/_src/lib/X. Imports relativos
// `../../src/X` foram bulk-rewritten pra `src/X`.
config.watchFolders = [
  ...(config.watchFolders || []),
  path.join(projectRoot, 'app', '_src'),
];

config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  src: path.join(projectRoot, 'app', '_src'),
};

// OTA bundle: cap workers pra evitar OOM em máquinas com muitos cores + pouca RAM
config.maxWorkers = 3;

module.exports = config;
