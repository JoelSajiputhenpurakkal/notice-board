"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type User = { id: string; name: string; email: string };
type Community = { id: string; name: string; description: string; role: string; members: number };
type Notice = { id: string; title: string; subtitle: string; body: string; action: string; author: string; createdAt: string; acknowledgements: number; completed: boolean };

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options.headers }, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [activeId, setActiveId] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [invite, setInvite] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const active = communities.find((c) => c.id === activeId) || communities[0];

  const loadCommunities = useCallback(async () => {
    const data = await api("/api/communities");
    setCommunities(data.communities);
    setActiveId((current) => data.communities.some((c: Community) => c.id === current) ? current : data.communities[0]?.id || "");
  }, []);

  const loadNotices = useCallback(async (id: string) => {
    if (!id) { setNotices([]); return; }
    const data = await api("/api/notices?communityId=" + encodeURIComponent(id));
    setNotices(data.notices);
  }, []);

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get("invite");
    if (inviteToken) setInvite(inviteToken);
    api("/api/auth/me").then(async ({ user: account }) => {
      setUser(account);
      if (account) {
        await loadCommunities();
        if (inviteToken) await joinInvite(inviteToken);
      }
    }).catch((e) => setError(e.message));
  }, [loadCommunities]);

  useEffect(() => { loadNotices(activeId).catch((e) => setError(e.message)); }, [activeId, loadNotices]);

  async function joinInvite(token: string) {
    const data = await api("/api/invites/" + encodeURIComponent(token) + "/join", { method: "POST" });
    await loadCommunities();
    setActiveId(data.communityId);
    window.history.replaceState({}, "", "/");
    setInvite("");
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await api("/api/auth/" + mode, { method: "POST", body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }) });
      setUser(data.user); await loadCommunities();
      const token = invite || new URLSearchParams(window.location.search).get("invite");
      if (token) await joinInvite(token);
    } catch (e) { setError((e as Error).message); }
  }

  async function createCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const data = await api("/api/communities", { method: "POST", body: JSON.stringify({ name: form.get("name"), description: form.get("description") }) });
      await loadCommunities(); setActiveId(data.community.id); formElement.reset(); setToast("Community created.");
    } catch (e) { setError((e as Error).message); }
  }

  async function createNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/api/notices", { method: "POST", body: JSON.stringify({ communityId: activeId, title: form.get("title"), subtitle: form.get("subtitle"), body: form.get("body"), action: form.get("action") }) });
      formElement.reset(); await loadNotices(activeId); setToast("Notice published.");
    } catch (e) { setError((e as Error).message); }
  }

  async function acknowledge(id: string) {
    try { await api("/api/notices/" + id + "/ack", { method: "POST" }); await loadNotices(activeId); }
    catch (e) { setError((e as Error).message); }
  }

  async function createInvite() {
    try {
      const data = await api("/api/communities/" + activeId + "/invites", { method: "POST" });
      await navigator.clipboard.writeText(data.url); setToast("Invite link copied. It expires in 7 days.");
    } catch (e) { setError((e as Error).message); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }); setUser(null); setCommunities([]); setNotices([]);
  }

  if (!user) return <main className="auth-wrap"><section className="auth-card">
    <div className="brand"><div className="brand-mark">N</div><span>Notice<span className="brand-accent">Board</span></span></div>
    <p className="eyebrow">COMMUNITY UPDATES, MADE CLEAR</p><h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
    <p>Keep important community updates and actions in one place.</p>
    {invite && <p className="success-note">Sign in or create an account to accept your invite.</p>}
    <form onSubmit={authenticate}>
      {mode === "register" && <label>Your name<input name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>}
      <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
      <label>Password<input name="password" type="password" required minLength={mode === "register" ? 10 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"} />{mode === "register" && <small>Use at least 10 characters.</small>}</label>
      {error && <p className="error-note">{error}</p>}
      <button className="primary-button full-button">{mode === "login" ? "Sign in" : "Create account"}</button>
    </form>
    <p className="auth-switch">{mode === "login" ? "New to NoticeBoard?" : "Already have an account?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
  </section></main>;

  const filteredNotices = notices.filter((n) => (n.title + " " + n.subtitle + " " + n.body).toLowerCase().includes(query.toLowerCase()));
  return <main className="app-shell">
    <aside className={"sidebar " + (sidebarOpen ? "open" : "")}>
      <div className="brand"><div className="brand-mark">N</div><span>Notice<span className="brand-accent">Board</span></span></div>
      <p className="side-label">Your communities</p>
      <nav className="side-communities">{communities.map((c) => <button key={c.id} className={"side-community " + (c.id === activeId ? "selected" : "")} onClick={() => { setActiveId(c.id); setSidebarOpen(false); }}>{c.name}</button>)}</nav>
      <form className="community-form" onSubmit={createCommunity}><h3>Start a community</h3><label>Name<input name="name" required minLength={2} maxLength={80} placeholder="e.g. Apartment association" /></label><label>Description<input name="description" maxLength={300} placeholder="What is it for?" /></label><button className="secondary-button">Create community</button></form>
      <div className="sidebar-bottom"><div className="profile-mini"><div className="avatar user">{user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div><strong>{user.name}</strong><small>{user.email}</small></div></div><button className="nav-item" onClick={logout}>Sign out</button></div>
    </aside>
    {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <section className="content-area">
      <header className={"topbar " + (sidebarOpen ? "menu-open" : "")}><button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button><div className="breadcrumb"><span className="muted">Communities</span><span className="chevron">›</span><strong>{active?.name || "Overview"}</strong></div><span className="top-name">{user.name}</span></header>
      <div className="page-content">
        {error && <p className="error-note">{error}<button onClick={() => setError("")}>Dismiss</button></p>}
        {active ? <>
          <div className="page-heading"><div><div className="eyebrow">COMMUNITY NOTICE BOARD</div><h1>{active.name}</h1><p>{active.description || "Important updates and actions for your community."}</p></div><div className="heading-actions">{active.role === "ADMIN" && <button className="secondary-button" onClick={createInvite}>Copy invite link</button>}</div></div>
          <div className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notices..." /></div><span>{notices.length} notices</span></div>
          {active.role === "ADMIN" && <form className="notice-form" onSubmit={createNotice}><h2>Publish a notice</h2><label>Title<input name="title" required minLength={3} maxLength={120} placeholder="What should members know?" /></label><label>Summary<input name="subtitle" maxLength={200} placeholder="Optional short context" /></label><label>Details<textarea name="body" required maxLength={10000} rows={4} placeholder="Share the details and any action members need to take." /></label><label>Action button label<input name="action" maxLength={40} defaultValue="Mark as read" /></label><button className="primary-button">Publish notice</button></form>}
          <div className="notice-list">{filteredNotices.length ? filteredNotices.map((n) => <article className="notice-card" key={n.id}><div className="notice-card-top"><span className="notice-tag update">NOTICE</span><span className="muted">{new Date(n.createdAt).toLocaleDateString()}</span></div><h2>{n.title}</h2>{n.subtitle && <h3>{n.subtitle}</h3>}<p>{n.body}</p><div className="notice-footer"><div className="author"><strong>{n.author}</strong><small>{n.acknowledgements} acknowledged</small></div><button className={"ack-button " + (n.completed ? "done" : "")} disabled={n.completed} onClick={() => acknowledge(n.id)}>{n.completed ? "✓ Acknowledged" : n.action}</button></div></article>) : <div className="empty-state"><h2>{notices.length ? "No notices match your search" : "No notices yet"}</h2><p>{notices.length ? "Try another search." : "New community notices will appear here."}</p></div>}</div>
        </> : <div className="empty-state welcome-empty"><h1>Welcome to NoticeBoard</h1><p>Create a community to publish updates and invite members.</p></div>}
      </div>
    </section>
    {toast && <div className="toast"><span>✓</span>{toast}<button onClick={() => setToast("")}>×</button></div>}
  </main>;
}