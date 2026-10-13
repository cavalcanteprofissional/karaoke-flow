import { afterEach, describe, expect, it, vi } from "vitest";

import { captureError } from "./observability";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("captureError", () => {
  it("loga estruturado com a mensagem e o digest", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("quebrou"), { digest: "abc123" });

    captureError(error, { boundary: "route" });

    expect(spy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = spy.mock.calls[0];
    expect(prefix).toBe("[observability]");
    expect(JSON.parse(payload as string)).toEqual({
      level: "error",
      message: "quebrou",
      digest: "abc123",
      boundary: "route",
    });
  });

  it("aceita qualquer valor e sem contexto", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    captureError("falha solta");

    const [, payload] = spy.mock.calls[0];
    const parsed = JSON.parse(payload as string);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("falha solta");
  });
});
