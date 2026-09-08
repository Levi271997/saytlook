import type { ImageNode } from '@digitalfeet/analyzer';

const REQUEST_TIMEOUT_MS = 8000;
const CONCURRENCY = 8;

/**
 * HEAD-check every image the page rendered, so the analyzer can flag non-2xx
 * responses (feature 2).
 *
 * Requests are deduplicated by resolved URL - a logo repeated in the header and
 * footer costs one request, not two.
 */
export async function checkImages(images: ImageNode[], pageUrl: string): Promise<ImageNode[]> {
  const targets = new Map<string, string>(); // resolved URL -> itself

  for (const image of images) {
    const resolved = resolveSrc(image.src, pageUrl);
    if (resolved && !targets.has(resolved)) targets.set(resolved, resolved);
  }

  const results = new Map<string, { status?: number; checkError?: string }>();

  await runWithConcurrency([...targets.keys()], CONCURRENCY, async (url) => {
    results.set(url, await checkOne(url, pageUrl));
  });

  return images.map((image) => {
    const resolved = resolveSrc(image.src, pageUrl);

    // data: URIs and empty srcs are not fetchable; naturalWidth still catches
    // a malformed one, so leave status undefined rather than inventing a failure.
    if (!resolved) return image;

    const result = results.get(resolved);
    if (!result) return image;

    return {
      ...image,
      ...(result.status !== undefined ? { status: result.status } : {}),
      ...(result.checkError !== undefined ? { checkError: result.checkError } : {}),
    };
  });
}

async function checkOne(url: string, referer: string): Promise<{ status?: number; checkError?: string }> {
  try {
    const head = await request(url, 'HEAD', referer);

    // Plenty of CDNs and WAFs reject HEAD but serve GET happily. Confirm with a
    // ranged GET before calling the image broken.
    if (head.status === 403 || head.status === 405 || head.status === 501 || head.status >= 500) {
      try {
        const get = await request(url, 'GET', referer);
        return { status: get.status };
      } catch {
        return { status: head.status };
      }
    }

    return { status: head.status };
  } catch (error) {
    return { checkError: describeError(error) };
  }
}

async function request(url: string, method: 'HEAD' | 'GET', referer: string): Promise<Response> {
  return fetch(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      // Some hosts hotlink-protect or serve 403 to unknown agents.
      'user-agent': 'Mozilla/5.0 (compatible; DigitalfeetQA/0.1; +internal-tool)',
      accept: 'image/*,*/*;q=0.8',
      referer,
      ...(method === 'GET' ? { range: 'bytes=0-0' } : {}),
    },
  });
}

/** Absolute, protocol-relative and root-relative srcs all need resolving. */
export function resolveSrc(src: string, pageUrl: string): string | undefined {
  const trimmed = src.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return undefined;

  try {
    return new URL(trimmed, pageUrl).toString();
  } catch {
    return undefined;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return `Request timed out after ${REQUEST_TIMEOUT_MS}ms`;
    }
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ? `${cause.code}: ${error.message}` : error.message;
  }
  return String(error);
}

/** Simple worker-pool so a page with 200 images does not open 200 sockets. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item === undefined) continue;
      await worker(item);
    }
  });

  await Promise.all(runners);
}
