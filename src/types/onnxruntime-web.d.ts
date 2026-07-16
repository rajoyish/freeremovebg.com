// onnxruntime-web ships types (types.d.ts) but its package.json "exports" map
// doesn't expose them for the "." entrypoint, so TypeScript resolves the import
// as implicit any (ts7016) under strict mode. Declare the narrow surface this
// codebase actually uses (removal.worker.ts touches only ort.env.wasm).
declare module 'onnxruntime-web' {
  export const env: {
    wasm: {
      numThreads: number;
      proxy: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}
