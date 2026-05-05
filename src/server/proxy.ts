import { ProxyAgent, setGlobalDispatcher } from 'undici';

let initialized = false;

// Next.js bundles undici into the server chunks, where `dispatcher` on
// per-request fetch init is silently dropped (the bundled fetch resolves
// to globalThis.fetch). Setting a global dispatcher works regardless.
export function ensureProxyDispatcher(): void {
  if (initialized) return;
  initialized = true;

  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (proxy) {
    setGlobalDispatcher(new ProxyAgent(proxy));
  }
}

ensureProxyDispatcher();
