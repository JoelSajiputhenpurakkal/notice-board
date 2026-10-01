"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [message, setMessage] = useState("Joining community…");
  useEffect(() => {
    fetch("/api/invites/" + token + "/join", { method: "POST" }).then(async (response) => {
      const data = await response.json();
      if (response.status === 401) { setMessage("Sign in first, then reopen this invite link."); return; }
      if (!response.ok) throw new Error(data.error || "Invite link could not be used.");
      router.replace("/?community=" + data.communityId);
    }).catch((error) => setMessage(error.message));
  }, [router, token]);
  return <main className="auth-wrap"><section className="auth-card"><div className="brand"><div className="brand-mark">N</div><span>Notice<span className="brand-accent">Board</span></span></div><h1>{message}</h1><a href="/">Return to NoticeBoard</a></section></main>;
}