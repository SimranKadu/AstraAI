import { Link } from "@tanstack/react-router";
import { Satellite } from "lucide-react";
import type { ReactNode } from "react";

/** Centered page used by the sign-in, check-your-email and account-verified screens. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-dvh place-items-center overflow-y-auto bg-background px-4 text-foreground">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-md border border-border bg-accent text-primary">
            <Satellite className="size-4" />
          </div>
          <span className="text-lg font-semibold text-primary">ASTRAAI</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

const TONES = {
  success: "border-primary/40 bg-primary/10 text-primary",
  info: "border-primary/30 bg-accent text-primary",
  warning: "border-destructive/40 bg-destructive/10 text-destructive",
  loading: "border-border bg-accent text-muted-foreground",
} as const;

/** A large icon, a heading and some text: the "big message" layout for account states. */
export function StatusPanel({
  tone,
  icon,
  title,
  children,
  actions,
}: {
  tone: keyof typeof TONES;
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className="rounded-xl border border-border bg-card p-8 text-center duration-500 animate-in fade-in zoom-in-95"
    >
      <div className={`mx-auto grid size-16 place-items-center rounded-full border ${TONES[tone]}`} aria-hidden="true">
        {icon}
      </div>
      <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
      {children && <div className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</div>}
      {actions && <div className="mt-6 flex flex-col gap-2">{actions}</div>}
    </div>
  );
}
