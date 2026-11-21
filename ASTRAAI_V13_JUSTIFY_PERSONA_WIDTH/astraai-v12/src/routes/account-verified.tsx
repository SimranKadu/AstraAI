import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthLayout, StatusPanel } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/account-verified")({
  head: () => pageHead("Account verified", "Your ASTRAAI email address has been verified."),
  component: AccountVerified,
});

type State = "checking" | "verified" | "expired" | "none";

/** Where the link in the verification email lands. */
function AccountVerified() {
  const [state, setState] = useState<State>("checking");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const failed = Boolean(hash.get("error") || hash.get("error_description") || query.get("error") || query.get("error_description"));

    const verified = (address?: string | null) => {
      if (!active) return;
      setEmail(address ?? "");
      setState("verified");
      window.history.replaceState(null, "", "/account-verified"); // keep tokens out of the address bar
    };

    // The Supabase client reads the link's tokens and signs the user in; wait for that.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) verified(session.user.email);
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) verified(session.user.email);
      else if (failed && active) setState("expired");
    });
    const timer = setTimeout(() => {
      if (active) setState((current) => (current === "checking" ? (failed ? "expired" : "none") : current));
    }, 2500);

    return () => {
      active = false;
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthLayout>
      {state === "checking" && (
        <StatusPanel tone="loading" icon={<LoaderCircle className="size-8 animate-spin" />} title="Verifying your account">
          <p>One moment while we confirm your email address.</p>
        </StatusPanel>
      )}

      {state === "verified" && (
        <StatusPanel
          tone="success"
          icon={<CircleCheck className="size-9" />}
          title="Your account is verified"
          actions={
            <Button asChild size="lg">
              <Link to="/dashboard">Continue to dashboard</Link>
            </Button>
          }
        >
          <p>
            Thank you{email ? <> for confirming <span className="font-medium text-foreground">{email}</span></> : ""}.
            Your email address is verified and you are signed in.
          </p>
          <p>You can now explore missions, ask the AI Assistant and plan your space career.</p>
        </StatusPanel>
      )}

      {state === "expired" && (
        <StatusPanel
          tone="warning"
          icon={<TriangleAlert className="size-8" />}
          title="This link has expired"
          actions={
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "login" }}>Go to log in</Link>
            </Button>
          }
        >
          <p>Verification links work once and expire after a while. If you already verified your email, just log in.</p>
          <p>If not, log in with your email and password and we will offer to send you a new link.</p>
        </StatusPanel>
      )}

      {state === "none" && (
        <StatusPanel
          tone="info"
          icon={<TriangleAlert className="size-8" />}
          title="Nothing to verify here"
          actions={
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "login" }}>Go to log in</Link>
            </Button>
          }
        >
          <p>Open the verification link from your email on this device. If you already verified your account, log in to continue.</p>
        </StatusPanel>
      )}
    </AuthLayout>
  );
}
