"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace("/?invite=" + encodeURIComponent(token));
  }, [router, token]);

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="brand">
          <div className="brand-mark">N</div>
          <span>Notice<span className="brand-accent">Board</span></span>
        </div>
        <h1>Opening your invitation…</h1>
        <p>Sign in or create an account to join this group.</p>
      </section>
    </main>
  );
}
