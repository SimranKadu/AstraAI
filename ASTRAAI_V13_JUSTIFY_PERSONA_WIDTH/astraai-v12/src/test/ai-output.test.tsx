// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { AiOutput } from "@/components/ai-output";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const show = async (justify: boolean) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () => createRoot(el).render(<AiOutput text={"A paragraph of text."} loading={false} error="" empty="none" justify={justify} />));
  return el;
};

it("uses the justified, 3% larger style only when asked", async () => {
  expect((await show(true)).querySelector(".ai-justified")).not.toBeNull();
  const plain = await show(false);
  expect(plain.querySelector(".ai-justified")).toBeNull();
  expect(plain.querySelector(".text-sm")).not.toBeNull();
});
