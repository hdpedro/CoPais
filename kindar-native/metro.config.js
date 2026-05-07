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

// watchFolders: ainda incluimos src/ pra hot-reload local funcionar.
config.watchFolders = [
  ...(config.watchFolders || []),
  path.join(projectRoot, 'src'),
];

// extraNodeModules: faz Metro tratar 'src' como pacote node_modules.
// Quando algum arquivo faz `import 'src/lib/supabase'`, Metro resolve via
// extraNodeModules['src'] -> <projectRoot>/src/lib/supabase. Sem ..
// relatives, sem cross-dir issues no worker EAS.
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  src: path.join(projectRoot, 'src'),
};

module.exports = config;
