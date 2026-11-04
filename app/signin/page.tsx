import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark, TextField } from "@/components/ui";
import { guestSignIn, demoSignIn, emailSignIn } from "./actions";
import { currentUser } from "@/lib/server/session";
import { signOut } from "@/auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; sent?: string; err?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/floor";
  const user = await currentUser();
  const demo = process.env.NODE_ENV !== "production" || process.env.SZ_DEMO_LOGIN === "1";
  return (
    <main id="main" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="card" style={{ width: 460, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
        <Link href="/">
          <LogoMark />
        </Link>
        <h1 className="h2">Sign in to coach</h1>
        {sp.err || sp.error ? <p className="dn" role="alert">{sp.err ?? "Sign-in failed. Try again."}</p> : null}
        {sp.sent ? <p className="br2" role="status">Check the server console: the magic link was printed there. No email is sent in this build.</p> : null}
        {user ? (
          <>
            <p className="mut">Signed in as {user.email ?? user.name}.</p>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="btn ghost" type="submit">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <form action={guestSignIn}>
              <input type="hidden" name="next" value={next} />
              <button className="btn block" type="submit">
                Continue as guest
              </button>
            </form>
            {demo ? (
              <form action={demoSignIn}>
                <input type="hidden" name="next" value={next} />
                <button className="btn ghost block" type="submit">
                  Continue as the demo coach
                </button>
              </form>
            ) : null}
            <hr className="hair" />
            <form action={emailSignIn} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="hidden" name="next" value={next} />
              <TextField id="email" name="email" type="email" label="Email for a magic link" placeholder="you@example.com" required autoComplete="email" />
              <button className="btn ghost" type="submit">
                Send magic link
              </button>
            </form>
          </>
        )}
        <p className="legal">Simulation. Fictional founders and funds. Not investment advice. Scrip has no cash value.</p>
      </div>
    </main>
  );
}
