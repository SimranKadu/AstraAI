import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const user = { id: "u1", email: "test@example.com" };
  return {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { access_token: "t", user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({}),
      },
    },
  };
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 60000 });

async function openCareers() {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  const { routeTree } = await import("@/routeTree.gen");
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() }, history: createMemoryHistory({ initialEntries: ["/careers"] }) });
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(<RouterProvider router={router} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
  const click = async (re: RegExp) => {
    const b = [...el.querySelectorAll("button")].find((x) => re.test(x.textContent ?? ""));
    if (!b) throw new Error(`button not found: ${re}`);
    await act(async () => b.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  };
  return { el, click, root };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Career Hub through the real router and sign-in guard", () => {
  it("opens the list, a role, its roadmap and back without the error screen", async () => {
    const { el, click, root } = await openCareers();
    expect(el.textContent).not.toContain("This page didn't load");
    expect(el.textContent).toContain("Related studies");
    await click(/Mechanical\/Aerospace/);
    expect(el.textContent).toContain("Exams and selection");
    await click(/Show roadmap/);
    expect(el.textContent).toContain("Month 6");
    await click(/All roles/);
    expect(el.textContent).not.toContain("This page didn't load");
    await act(async () => root.unmount());
  });
});
