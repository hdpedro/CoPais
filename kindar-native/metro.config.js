/**
 * Metro config — explicit setup to ensure module resolution works on EAS
 * workers. Without this, the eager-bundle phase on EAS started failing
 * with "Unable to resolve module '../../src/design-system/tokens' from
 * app/(tabs)/_layout.tsx" — the local bundle was identical and worked,
 * suggesting a worker-side resolver edge case with the parenthesized
 * (tabs) group folder.
 *
 * Returning the default config from getDefaultConfig() with `projectRoot`
 * set explicitly forces Metro to use the well-known resolver baseline
 * instead of any auto-detected variant.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Belt + suspenders: ensure the watchFolders include the project src so
// the resolver always sees src/design-system/tokens.ts when called from
// app/(tabs)/_layout.tsx, even if the worker's CWD is elsewhere.
config.watchFolders = [
  ...(config.watchFolders || []),
  path.join(projectRoot, 'src'),
];

module.exports = config;
