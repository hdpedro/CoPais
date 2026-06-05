// Committed static-asset module declarations for TypeScript.
//
// Why this file exists: Expo gitignores the auto-generated `expo-env.d.ts`,
// and `expo/types` does NOT declare static image modules — so `tsc --noEmit`
// fails to resolve `import logo from './x.png'` in CI, fresh clones and git
// worktrees where Expo hasn't run prebuild/start yet. These ambient
// declarations make the typecheck deterministic everywhere and guard against
// the "Cannot find module './x.png'" regression at the type level. Runtime
// asset resolution is handled by Metro independently of this file.
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
declare module '*.webp';
declare module '*.svg';
