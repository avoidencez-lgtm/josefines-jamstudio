/**
 * The TypeScript end of the `provider_fetch` proxy. Nothing in `src/` may call
 * `fetch()` against a provider directly; the key lives in the OS keychain and only
 * Rust attaches it.
 */

import { ipc } from "../../ipc/client";
import type {
  ProviderFetchRequest,
  ProviderFetchResponse,
} from "../../ipc/contract";

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function providerFetch(
  req: ProviderFetchRequest,
): Promise<ProviderFetchResponse> {
  return ipc.invoke<ProviderFetchResponse>("provider_fetch", {
    request: { method: "POST", headers: {}, body: null, ...req },
  });
}

/** POST JSON, expect JSON. Non-2xx becomes a `ProviderError` with the API's message. */
export async function providerJson<T>(
  provider: string,
  path: string,
  body: unknown,
  method: ProviderFetchRequest["method"] = "POST",
): Promise<T> {
  const res = await providerFetch({
    provider,
    path,
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? null : JSON.stringify(body),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new ProviderError(
      provider,
      res.status,
      `${provider} returned ${res.status}: ${summariseError(res.body)}`,
    );
  }
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new ProviderError(
      provider,
      res.status,
      `${provider} returned a non-JSON body`,
    );
  }
}

/** Pulls the human-readable part out of a provider error body. */
export function summariseError(body: string): string {
  try {
    const j = JSON.parse(body) as {
      error?: { message?: string; status?: string } | string;
      message?: string;
    };
    if (typeof j.error === "string") return j.error;
    if (j.error?.message) return j.error.message;
    if (j.message) return j.message;
  } catch {
    // not JSON
  }
  return body.length > 200 ? `${body.slice(0, 200)}…` : body;
}
