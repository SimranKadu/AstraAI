import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { AuthLayout, StatusPanel } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ mode: z.enum(["login", "signup"]).optional() }),
  head: () => pageHead("Sign in", "Log in or create your ASTRAAI account."),
  component: AuthPage,
});

const RESEND_SECONDS = 60;
// Where the verification email sends people. Set VITE_SITE_URL to your public address (not localhost) so the link also works on a phone.
const siteOrigin = () => (import.meta.env["VITE_SITE_URL"] as string | undefined)?.trim().replace(/\/+$/, "") || window.location.origin;
const verifiedUrl = () => `${siteOrigin()}/account-verified`;

type Pending = { email: string; reason: "signup" | "unverified" };

/** A password box with an eye button that shows or hides what is typed. */
function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (value: string) => void; autoComplete: string; invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={visible ? "text" : "password"} required autoComplete={autoComplete} value={value} aria-invalid={invalid || undefined} className={`pr-10 ${invalid ? "border-destructive" : ""}`} onChange={(e) => onChange(e.target.value)} />
      <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10 text-muted-foreground" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(search.mode ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const mismatch = mode === "signup" && confirmPassword.length > 0 && password !== confirmPassword;
  const matches = mode === "signup" && confirmPassword.length > 0 && password === confirmPassword;

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (mode === "signup" && password !== confirmPassword) return setError("Wrong password. The passwords do not match. Type the same password in both boxes.");
    setBusy(true);
    if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: verifiedUrl() },
      });
      if (err) setError(err.message);
      // Supabase answers "success" with no identities when the address is already registered.
      else if (data.user && data.user.identities?.length === 0)
        setError("An account with this email already exists. Log in instead.");
      else if (!data.session) setPending({ email, reason: "signup" });
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err && (err.code === "email_not_confirmed" || /not confirmed/i.test(err.message)))
        setPending({ email, reason: "unverified" });
      else if (err) setError(err.message);
    }
    setBusy(false);
  };

  if (pending)
    return (
      <AuthLayout>
        <CheckEmail
          pending={pending}
          onChangeEmail={() => setPending(null)}
          onLogin={() => {
            setPending(null);
            setMode("login");
          }}
        />
      </AuthLayout>
    );

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold">{mode === "login" ? "Log in" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "login" ? "Welcome back to mission control." : "Start exploring space intelligence."}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={setPassword} />
        </div>
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <PasswordInput id="confirm-password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} invalid={mismatch} />
            {mismatch && <p role="alert" className="text-sm text-destructive">Wrong password. The passwords do not match yet.</p>}
            {matches && <p className="text-sm text-primary">Passwords match.</p>}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || mismatch}>
          {busy ? "Please wait" : mode === "login" ? "Log in" : "Sign up"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        {mode === "login" ? "New to ASTRAAI? " : "Already have an account? "}
        <Button variant="link" className="h-auto p-0" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setConfirmPassword(""); }}>
          {mode === "login" ? "Create an account" : "Log in"}
        </Button>
      </p>
    </AuthLayout>
  );
}

/** Shown after sign-up (or a log-in attempt before verifying): tells the user to open the email. */
function CheckEmail({ pending, onChangeEmail, onLogin }: { pending: Pending; onChangeEmail: () => void; onLogin: () => void }) {
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    setSending(true);
    setNotice("");
    setProblem("");
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email: pending.email,
      options: { emailRedirectTo: verifiedUrl() },
    });
    setSending(false);
    if (err) return setProblem(err.message);
    setNotice("A new verification email is on its way.");
    setCooldown(RESEND_SECONDS);
  };

  return (
    <StatusPanel
      tone="info"
      icon={<MailCheck className="size-8" />}
      title="Check your email"
      actions={
        <>
          <Button onClick={resend} disabled={sending || cooldown > 0}>
            {sending ? "Sending" : cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend verification email"}
          </Button>
          <Button variant="ghost" onClick={onLogin}>I have verified, log me in</Button>
          <Button variant="link" className="h-auto p-0 text-xs" onClick={onChangeEmail}>Use a different email</Button>
        </>
      }
    >
      {pending.reason === "unverified" && <p className="font-medium text-foreground">Your email address is not verified yet.</p>}
      <p>
        We sent a verification link to <span className="font-medium text-foreground">{pending.email}</span>. Open it to verify your account.
      </p>
      <p>Can't see it? Check your spam folder. The link opens a page confirming that your account is verified.</p>
      <p>If the link shows "This site can't be reached" (for example when it is opened on a phone while ASTRAAI runs on your computer), your email is still verified. Just come back here and log in.</p>
      {notice && <p className="text-primary">{notice}</p>}
      {problem && <p className="text-destructive">{problem}</p>}
    </StatusPanel>
  );
}
