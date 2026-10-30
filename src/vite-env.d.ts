/**
 * MALVIA local Vite environment typings.
 * Kept independent from the vite/client type package so TypeScript can
 * complete its type check even if the editor/build environment has not
 * resolved Vite's ambient client declarations yet.
 */
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
