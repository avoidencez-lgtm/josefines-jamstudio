import { afterEach, describe, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import {
  ProviderError,
  providerFetch,
  providerJson,
  summariseError,
} from "../../src/lib/net/providerFetch";

afterEach(() => vi.restoreAllMocks());

describe("provider_fetch shim", () => {
  it("posts through ipc.invoke and never calls fetch", async () => {
    const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue({
      status: 200,
      headers: {},
      body: "{}",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      providerFetch({ provider: "gemini", path: "/v1beta/models" }),
    ).resolves.toEqual({ status: 200, headers: {}, body: "{}" });
    expect(invoke).toHaveBeenCalledWith("provider_fetch", {
      request: {
        method: "POST",
        headers: {},
        body: null,
        provider: "gemini",
        path: "/v1beta/models",
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("turns a non-2xx JSON body into ProviderError", async () => {
    vi.spyOn(ipc, "invoke").mockResolvedValue({
      status: 401,
      headers: {},
      body: JSON.stringify({ error: { message: "API key not valid" } }),
    });
    await expect(
      providerJson("openai", "/v1/responses", { n: 1 }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderError",
        provider: "openai",
        status: 401,
        message: expect.stringContaining("API key not valid"),
      }),
    );
    await expect(
      providerJson("openai", "/v1/responses", { n: 1 }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("summarises string, nested and plain error bodies", () => {
    expect(summariseError('{"error":"quota"}')).toBe("quota");
    expect(summariseError('{"error":{"message":"rate limited"}}')).toBe(
      "rate limited",
    );
    expect(summariseError('{"message":"unavailable"}')).toBe("unavailable");
    expect(summariseError("not json")).toBe("not json");
    expect(summariseError("x".repeat(201)).endsWith("…")).toBe(true);
  });
});
