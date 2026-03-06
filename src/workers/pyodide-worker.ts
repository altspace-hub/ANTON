/// <reference lib="webworker" />
// Web Worker — loads Pyodide from CDN, executes Python code, returns result
// This file is intentionally a Web Worker entry point

declare const self: DedicatedWorkerGlobalScope;

let pyodidePromise: Promise<unknown> | null = null;

async function loadPyodideInstance() {
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js');
  // @ts-expect-error — loadPyodide is injected by the script above
  return await (globalThis as Record<string, unknown>).loadPyodide();
}

self.onmessage = async ({ data }: MessageEvent<{ code: string }>) => {
  try {
    if (!pyodidePromise) {
      pyodidePromise = loadPyodideInstance();
    }
    const pyodide = await pyodidePromise;
    // @ts-expect-error — pyodide is dynamically typed
    const result = await pyodide.runPythonAsync(data.code);
    self.postMessage({ ok: true, output: String(result ?? '') });
  } catch (e: unknown) {
    self.postMessage({ ok: false, error: String(e) });
  }
};
