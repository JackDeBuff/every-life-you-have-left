// Vite's import.meta.glob, used by worker/engine-select.ts (the worker tsconfig has no vite/client types).
interface ImportMeta {
  glob<T = unknown>(pattern: string, opts?: { eager?: false }): Record<string, () => Promise<T>>;
}
