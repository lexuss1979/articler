// Standalone reproducer for the prod proxy issue.
// Mirrors openrouter.ts: setGlobalDispatcher(new ProxyAgent({ keepAliveTimeout: 1 }))
// + POST /chat/completions with a tiny body, run N times sequentially.
//
// Run locally:
//   HTTP_PROXY='...' OPENROUTER_API_KEY='sk-...' node scripts/proxy-test.mjs
//
// Run on VPS (no node installed on host; use a throwaway docker container):
//   docker run --rm -i \
//     -e HTTP_PROXY="$(grep ^HTTP_PROXY /srv/articler/.env | cut -d= -f2-)" \
//     -e OPENROUTER_API_KEY="$(grep ^OPENROUTER_API_KEY /srv/articler/.env | cut -d= -f2-)" \
//     -v /srv/articler/scripts/proxy-test.mjs:/test.mjs:ro \
//     node:22-alpine sh -c 'npm i undici@8 --silent && node /test.mjs'

import { ProxyAgent, setGlobalDispatcher } from 'undici';

const N = Number(process.argv[2] || 20);
const MODEL = process.argv[3] || 'anthropic/claude-haiku-4.5';
const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.error('OPENROUTER_API_KEY not set');
  process.exit(1);
}

console.log(`node: ${process.version}`);
console.log(`runs: ${N}`);
console.log(`model: ${MODEL}`);
if (proxy) {
  const safe = proxy.replace(/\/\/[^@]+@/, '//***:***@');
  console.log(`proxy: ${safe}`);
  setGlobalDispatcher(
    new ProxyAgent({
      uri: proxy,
      keepAliveTimeout: 1,
      keepAliveMaxTimeout: 1,
    }),
  );
} else {
  console.log('proxy: none (going direct)');
}
console.log('---');

const counts = { ok: 0, fail: 0, codes: {} };

function bumpCode(label) {
  counts.codes[label] = (counts.codes[label] ?? 0) + 1;
}

function describeError(err) {
  const causeMsg = err?.cause?.message ?? '';
  const causeCode = err?.cause?.code ?? err?.code ?? 'ERR';
  const innerCode = err?.cause?.cause?.code;
  const innerMsg = err?.cause?.cause?.message;
  return {
    code: innerCode || causeCode,
    summary: `${err?.name ?? 'Error'}: ${err?.message ?? ''} | cause: ${causeCode} ${causeMsg}${innerCode ? ` | inner: ${innerCode} ${innerMsg ?? ''}` : ''}`,
  };
}

for (let i = 1; i <= N; i++) {
  const t0 = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Say only the word "ok".' }],
        max_tokens: 5,
        stream: false,
      }),
    });
    const ms = Date.now() - t0;
    if (res.ok) {
      counts.ok++;
      bumpCode(String(res.status));
      console.log(`${i.toString().padStart(2)}: ${res.status} OK    (${ms}ms)`);
    } else {
      counts.fail++;
      bumpCode(String(res.status));
      const body = (await res.text()).slice(0, 120).replace(/\s+/g, ' ');
      console.log(`${i.toString().padStart(2)}: ${res.status} FAIL  (${ms}ms) ${body}`);
    }
  } catch (err) {
    const ms = Date.now() - t0;
    const { code, summary } = describeError(err);
    counts.fail++;
    bumpCode(code);
    console.log(`${i.toString().padStart(2)}: ${code} ERR   (${ms}ms) ${summary}`);
  }
}

console.log('---');
console.log(`OK: ${counts.ok}/${N}    FAIL: ${counts.fail}/${N}`);
console.log('codes:', counts.codes);
