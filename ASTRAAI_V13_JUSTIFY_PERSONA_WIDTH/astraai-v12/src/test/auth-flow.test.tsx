import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resend: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  listeners: [] as ((event: string, session: unknown) => void)[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      resend: mocks.resend,
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        mocks.listeners.push(callback);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 60000 });

let el: HTMLDivElement;
let root: Root;

// Works with real or fake timers, so a test can install the fake clock before the page mounts.
const wait = (ms: number) => (vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(ms) : new Promise((r) => setTimeout(r, ms)));

async function open(path: string) {
  const { routeTree } = await import("@/routeTree.gen");
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() }, history: createMemoryHistory({ initialEntries: [path] }) });
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root.render(<RouterProvider router={router} />));
  await act(async () => { await wait(400); });
}
const type = async (id: string, value: string) => {
  const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const button = (re: RegExp) => [...el.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""));
const press = async (re: RegExp) => {
  const b = button(re);
  if (!b) throw new Error(`button not found: ${re}`);
  await act(async () => b.click());
};
const settle = () => act(async () => { await wait(50); });

beforeEach(() => {
  mocks.listeners.length = 0;
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.resend.mockResolvedValue({ error: null });
  window.history.replaceState(null, "", "/");
});
afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("Sign-up and email verification", () => {
  it("asks for the password twice and shows 'wrong password' until both match", async () => {
    await open("/auth?mode=signup");
    await type("email", "neha@example.com");
    await type("password", "supersecret1");
    await type("confirm-password", "different123");
    await settle();
    expect(el.textContent).toContain("Wrong password");
    expect(button(/^Sign up$/)?.hasAttribute("disabled")).toBe(true);
    expect(mocks.signUp).not.toHaveBeenCalled();
    await type("confirm-password", "supersecret1");
    await settle();
    expect(el.textContent).not.toContain("Wrong password");
    expect(el.textContent).toContain("Passwords match");
    expect(button(/^Sign up$/)?.hasAttribute("disabled")).toBe(false);
  });

  it("has an eye button that shows and hides the password", async () => {
    await open("/auth?mode=login");
    const field = el.querySelector<HTMLInputElement>("#password")!;
    expect(field.type).toBe("password");
    await act(async () => { el.querySelector<HTMLButtonElement>('button[aria-label="Show password"]')!.click(); });
    expect(el.querySelector<HTMLInputElement>("#password")!.type).toBe("text");
    await act(async () => { el.querySelector<HTMLButtonElement>('button[aria-label="Hide password"]')!.click(); });
    expect(el.querySelector<HTMLInputElement>("#password")!.type).toBe("password");
  });

  it("shows a full 'Check your email' screen after sign-up", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    await open("/auth?mode=signup");
    await type("email", "neha@example.com");
    await type("password", "supersecret1");
    await type("confirm-password", "supersecret1");
    await press(/^Sign up$/);
    await settle();
    expect(el.textContent).toContain("Check your email");
    expect(el.textContent).toContain("neha@example.com");
    expect(el.querySelector("form")).toBeNull();
    expect(button(/Resend email in 60s/)?.hasAttribute("disabled")).toBe(true);
    expect(mocks.signUp.mock.calls[0]![0].options.emailRedirectTo).toMatch(/\/account-verified$/);
  });

  it("lets the user resend the email after the countdown", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await open("/auth?mode=signup");
    await type("email", "neha@example.com");
    await type("password", "supersecret1");
    await type("confirm-password", "supersecret1");
    await press(/^Sign up$/);
    await settle();
    for (let i = 0; i < 61; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); // one tick per second
    const resend = button(/Resend verification email/)!;
    expect(resend.hasAttribute("disabled")).toBe(false);
    await act(async () => resend.click());
    expect(mocks.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "neha@example.com" }));
    expect(el.textContent).toContain("A new verification email is on its way.");
    expect(el.textContent).toMatch(/Resend email in \d+s/);
  });

  it("says so when the email is already registered", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    await open("/auth?mode=signup");
    await type("email", "neha@example.com");
    await type("password", "supersecret1");
    await type("confirm-password", "supersecret1");
    await press(/^Sign up$/);
    await settle();
    expect(el.textContent).toContain("already exists");
    expect(el.textContent).not.toContain("Check your email");
  });

  it("offers a new link when logging in before verifying", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Email not confirmed", code: "email_not_confirmed" } });
    await open("/auth");
    await type("email", "neha@example.com");
    await type("password", "supersecret1");
    await press(/^Log in$/);
    await settle();
    expect(el.textContent).toContain("Your email address is not verified yet.");
    expect(button(/Resend/)).toBeDefined();
  });
});

describe("Account verified page", () => {
  it("shows 'Your account is verified' with a way into the app", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { email: "neha@example.com" } } } });
    await open("/account-verified");
    await settle();
    expect(el.textContent).toContain("Your account is verified");
    expect(el.textContent).toContain("neha@example.com");
    expect(el.querySelector('a[href="/dashboard"]')?.textContent).toContain("Continue to dashboard");
  });

  it("verifies when the sign-in event arrives after the page opens", async () => {
    await open("/account-verified");
    expect(el.textContent).toContain("Verifying your account");
    await act(async () => mocks.listeners.forEach((l) => l("SIGNED_IN", { user: { email: "late@example.com" } })));
    expect(el.textContent).toContain("Your account is verified");
    expect(el.textContent).toContain("late@example.com");
  });

  it("explains an expired link", async () => {
    window.history.replaceState(null, "", "/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await open("/account-verified");
    await settle();
    expect(el.textContent).toContain("This link has expired");
    expect(el.querySelector('a[href^="/auth"]')).not.toBeNull();
  });

  it("explains when there is nothing to verify", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await open("/account-verified");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(el.textContent).toContain("Nothing to verify here");
  });
});
