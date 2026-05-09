const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_CONTENT_CHARS = 50_000;
const FETCH_TIMEOUT_MS = 10_000;

export type FetchExampleUrlResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

export async function fetchExampleUrl(url: string): Promise<FetchExampleUrlResult> {
  try {
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Network error: ${message}` };
    }

    if (response.status !== 200) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('text/html') && !contentType.startsWith('text/plain')) {
      return { ok: false, error: `Unsupported content-type: ${contentType}` };
    }

    let rawText: string;
    try {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BODY_BYTES) {
        const slice = buffer.slice(0, MAX_BODY_BYTES);
        rawText = new TextDecoder().decode(slice);
      } else {
        rawText = new TextDecoder().decode(buffer);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to read body: ${message}` };
    }

    // Strip <script>...</script> and <style>...</style> blocks (including content)
    let text = rawText
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Cap final text
    if (text.length > MAX_CONTENT_CHARS) {
      text = text.slice(0, MAX_CONTENT_CHARS);
    }

    return { ok: true, content: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Unexpected error: ${message}` };
  }
}
