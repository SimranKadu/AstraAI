import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const user = { id: "u1", email: "test@example.com" };
  return { supabase: { auth: { getUser: async () => ({ data: { user }, error: null }), getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) } } };
});
// Simulate the Career Hub failing to load, as a missing data file would.
vi.mock("@/data/careers", () => ({
  CAREER_GUIDE: { groups: [], officialLinks: [], updated: "" },
  CAREER_ROLES: { map: () => [], find: () => { throw new Error("Boom: careers data could not be loaded"); }, filter: () => [] },
  roleDetail: () => ({}),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 60000 });

it("shows what went wrong on the error screen when running locally", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { routeTree } = await import("@/routeTree.gen");
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() }, history: createMemoryHistory({ initialEntries: ["/careers"] }) });
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(<RouterProvider router={router} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 800)); });
  expect(el.textContent).toContain("This page didn't load");
  expect(el.querySelector('[data-testid="error-details"]')?.textContent).toContain("Boom: careers data could not be loaded");
  await act(async () => root.unmount());
});
