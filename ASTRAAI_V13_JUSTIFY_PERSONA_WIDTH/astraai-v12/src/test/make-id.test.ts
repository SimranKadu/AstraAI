import { afterEach, expect, it, vi } from "vitest";
import { makeId } from "@/lib/astra-storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
afterEach(() => vi.unstubAllGlobals());

it("makes a valid id even when crypto.randomUUID is missing (plain http pages)", () => {
  vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(7) });
  expect(makeId()).toMatch(UUID);
});

it("still works when there is no crypto object at all", () => {
  vi.stubGlobal("crypto", undefined);
  const a = makeId(), b = makeId();
  expect(a).toMatch(UUID);
  expect(a).not.toBe(b);
});

it("uses the built-in randomUUID when it exists", () => {
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
  expect(makeId()).toBe("11111111-1111-4111-8111-111111111111");
});
