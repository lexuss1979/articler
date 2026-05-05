import { ProxyAgent, setGlobalDispatcher } from 'undici';

let initialized = false;

// Next.js bundles undici into the server chunks, where `dispatcher` on
// per-request fetch init is silently dropped (the bundled fetch resolves
// to globalThis.fetch). Setting a global dispatcher works regardless.
//
// keepAliveTimeout/keepAliveMaxTimeout=1ms forces a fresh CONNECT tunnel
// per request. Residential proxies (rotating-IP pools) frequently drop
// the underlying socket after one round-trip, so the next request through
// the same tunnel sees a 502 / RST. curl hits 100% because it opens a
// fresh tunnel every invocation.
export function ensureProxyDispatcher(): void {
  if (initialized) return;
  initialized = true;

  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (proxy) {
    setGlobalDispatcher(
      new ProxyAgent({
        uri: proxy,
        keepAliveTimeout: 1,
        keepAliveMaxTimeout: 1,
      }),
    );
  }
}

ensureProxyDispatcher();
