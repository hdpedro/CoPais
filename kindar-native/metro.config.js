/**
 * Metro config — explicit setup to ensure module resolution works on EAS
 * workers.
 *
 * EAS bug history: na fase EAGER_BUNDLE (`expo export:embed --eager`),
 * o resolver do worker EAS tropeca em imports relativos que cruzam a
 * pasta com parenteses `(tabs)` para `../../src/...`. Local bundle
 * funciona; EAS quebra. Builds 53-60 (multiplos) bateram nesse mesmo
 * bug, em diferentes arquivos da pasta (tabs).
 *
 * Solucao: alias `@/` -> `./src/*` via resolveRequest. tsconfig.json ja
 * tem o mesmo paths config, entao os tipos batem. (tabs)/*.tsx usa
 * `@/path` em vez de `../../src/path` e foge do edge case do resolver.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...(config.watchFolders || []),
  path.join(projectRoot, 'src'),
];

// Alias resolver: @/foo/bar -> <projectRoot>/src/foo/bar
const srcRoot = path.join(projectRoot, 'src');
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@' || moduleName.startsWith('@/')) {
    const target = moduleName === '@' ? srcRoot : path.join(srcRoot, moduleName.slice(2));
    return context.resolveRequest(context, target, platform);
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
