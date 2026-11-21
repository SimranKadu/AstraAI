import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  BriefcaseBusiness,
  Compass,
  FileText,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Orbit,
  Satellite,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { GlossaryHints } from "@/components/glossary-hints";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/auth-client";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/chat", label: "AI Assistant", icon: Bot },
  { to: "/explorer", label: "Mission Explorer", icon: Compass },
  { to: "/simulation", label: "Mission Simulation", icon: Orbit },
  { to: "/documents", label: "PDF Summary", icon: FileText },
  { to: "/diagrams", label: "Diagram Generator", icon: Network },
  { to: "/satellites", label: "Satellite Finder", icon: Satellite },
  { to: "/personas", label: "AI Personas", icon: UserRound },
  { to: "/careers", label: "Career Hub", icon: BriefcaseBusiness },
  { to: "/about", label: "About", icon: Info },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Word hints (meanings of space terms on hover) can be switched off; the choice is remembered.
  const [hints, setHints] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("astraai.wordHints") === "off") setHints(false);
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);
  const toggleHints = () => {
    setHints((on) => {
      try {
        localStorage.setItem("astraai.wordHints", on ? "off" : "on");
      } catch {
        /* the choice just will not be remembered */
      }
      return !on;
    });
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex h-dvh bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar p-4 transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="grid size-8 place-items-center rounded-md border border-border bg-accent text-primary">
            <Satellite className="size-4" />
          </div>
          <Link to="/dashboard" className="text-lg font-semibold text-primary">
            ASTRAAI
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "bg-sidebar-accent text-primary" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border pt-3">
          <p className="truncate px-2 font-mono text-xs text-muted-foreground">{user?.email}</p>
          <Button variant="ghost" className="mt-1 w-full justify-start" onClick={toggleHints} aria-pressed={hints} title="Underline space terms and show their meaning when you hover over them">
            <Info /> Word hints: {hints ? "On" : "Off"}
          </Button>
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
          <div className="flex gap-4 px-2 pt-2 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:text-primary">Privacy</Link>
            <Link to="/terms" className="hover:text-primary">Terms</Link>
          </div>
        </div>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-background/70 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle && (
              <p className="truncate font-mono text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </header>
        <main data-glossary-root className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">{children}</main>
        <GlossaryHints enabled={hints} />
      </div>
    </div>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-card p-5 ${className}`}>
      {title && (
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
