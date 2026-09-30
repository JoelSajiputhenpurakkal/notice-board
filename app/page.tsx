"use client";

import { useMemo, useState } from "react";

type Community = { id: string; name: string; short: string; color: string; members: number; description: string };
type Notice = { id: string; communityId: string; tag: string; title: string; subtitle: string; body: string; author: string; date: string; action: string; completed: boolean; links?: string[]; attachment?: string; acknowledgements: number };

const communities: Community[] = [
  { id: "college", name: "College Community", short: "CC", color: "lavender", members: 128, description: "Updates and important information for students." },
  { id: "apartment", name: "Apartment Association", short: "AA", color: "peach", members: 50, description: "Official notices and announcements for residents." },
  { id: "football", name: "Football Club", short: "FC", color: "mint", members: 24, description: "Training, fixtures, and club updates." },
  { id: "volunteers", name: "City Volunteers", short: "CV", color: "blue", members: 86, description: "Local opportunities to make a difference." }
];

const seedNotices: Notice[] = [
  { id: "n1", communityId: "apartment", tag: "ACTION REQUIRED", title: "Annual maintenance payment", subtitle: "Payment deadline: October 15", body: "All residents are requested to complete their annual maintenance payment before the deadline. Please keep your receipt for your records.", author: "John Doe", date: "Sep 28, 2026", action: "Payment completed", completed: false, links: ["Payment portal"], attachment: "Payment instructions.pdf", acknowledgements: 42 },
  { id: "n2", communityId: "apartment", tag: "IMPORTANT", title: "Water tank cleaning this Saturday", subtitle: "Service interruption from 9:00 AM", body: "The overhead water tanks will be cleaned this Saturday. Water supply may be interrupted for up to two hours.", author: "Sarah Smith", date: "Sep 26, 2026", action: "Mark as read", completed: true, acknowledgements: 47 },
  { id: "n3", communityId: "apartment", tag: "UPDATE", title: "New visitor parking guidelines", subtitle: "Please review before your next visit", body: "We have updated visitor parking guidelines to make arrivals easier for everyone. The new guide is attached below.", author: "John Doe", date: "Sep 22, 2026", action: "I have read this", completed: false, attachment: "Visitor parking guide.pdf", acknowledgements: 31 },
  { id: "n4", communityId: "college", tag: "IMPORTANT", title: "Semester examination schedule", subtitle: "Important examination information", body: "The semester examination schedule has been published. Please review the schedule and acknowledge that you have read it.", author: "Admin User", date: "Sep 29, 2026", action: "I have read this", completed: false, acknowledgements: 83 },
  { id: "n5", communityId: "football", tag: "UPDATE", title: "Saturday fixture moved to 5 PM", subtitle: "Riverside ground", body: "This weekend’s match will begin at 5 PM instead of 4 PM. Please arrive 30 minutes early.", author: "Alex Thomas", date: "Sep 27, 2026", action: "Confirm attendance", completed: false, acknowledgements: 16 }
];

function Icon({ children }: { children: React.ReactNode }) { return <span className="icon" aria-hidden="true">{children}</span>; }

export default function Home() {
  const [activeId, setActiveId] = useState("apartment");
  const [notices, setNotices] = useState(seedNotices);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [modal, setModal] = useState<"notice" | "community" | "invite" | null>(null);
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const active = communities.find((c) => c.id === activeId) ?? communities[0];
  const activeNotices = useMemo(() => notices.filter((n) => n.communityId === activeId).filter((n) => {
    const matches = `${n.title} ${n.subtitle} ${n.body}`.toLowerCase().includes(query.toLowerCase());
    return matches && (filter === "all" || (filter === "completed" ? n.completed : !n.completed));
  }), [activeId, filter, notices, query]);

  function acknowledge(id: string) {
    setNotices((items) => items.map((n) => n.id === id ? { ...n, completed: true, acknowledgements: n.acknowledgements + 1 } : n));
    setToast("Action recorded — you’re all caught up.");
    window.setTimeout(() => setToast(""), 2800);
  }

  function createNotice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const notice: Notice = { id: `n${Date.now()}`, communityId: activeId, tag: "NEW NOTICE", title: String(data.get("title")), subtitle: String(data.get("subtitle") || "Community update"), body: String(data.get("body")), author: "John Doe", date: "Sep 30, 2026", action: String(data.get("action") || "Mark as read"), completed: false, acknowledgements: 0 };
    setNotices((items) => [notice, ...items]); setModal(null); setToast("Notice published to the community."); window.setTimeout(() => setToast(""), 2800);
  }

  return <main className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark">N</div><span>Notice<span className="brand-accent">Board</span></span></div>
      <nav className="primary-nav" aria-label="Primary navigation">
        <button className="nav-item active"><Icon>⌂</Icon> Overview</button>
        <button className="nav-item"><Icon>▤</Icon> All notices <span className="nav-count">8</span></button>
        <button className="nav-item"><Icon>◷</Icon> Pending actions <span className="nav-count warm">3</span></button>
      </nav>
      <div className="side-label">Your communities <button onClick={() => setModal("community")} className="plus-button" aria-label="Create community">+</button></div>
      <div className="side-communities">{communities.map((c) => <button key={c.id} onClick={() => { setActiveId(c.id); setSidebarOpen(false); }} className={`side-community ${activeId === c.id ? "selected" : ""}`}><span className={`avatar small ${c.color}`}>{c.short}</span><span>{c.name}</span>{activeId === c.id && <span className="selected-dot" />}</button>)}</div>
      <div className="sidebar-bottom"><button className="nav-item"><Icon>⚙</Icon> Settings</button><div className="profile-mini"><div className="avatar user">JD</div><div><strong>John Doe</strong><small>Personal account</small></div><span className="more">•••</span></div></div>
    </aside>
    <section className="content-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">☰</button><div className="breadcrumb"><span className="muted">Communities</span><span className="chevron">›</span><strong>{active.name}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications">♧<span className="notification-dot" /></button><button className="top-profile"><span className="avatar user">JD</span><span className="top-name">John Doe</span><span>⌄</span></button></div></header>
      <div className="community-strip"><div className="strip-inner">{communities.map((c) => <button key={c.id} onClick={() => setActiveId(c.id)} className={`community-pill ${activeId === c.id ? "active" : ""}`}><span className={`avatar tiny ${c.color}`}>{c.short}</span><span>{c.name.replace(" Community", "")}</span></button>)}<button className="create-pill" onClick={() => setModal("community")}><span>+</span> New community</button></div></div>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">YOUR COMMUNITY</div><h1>{active.name}</h1><p>{active.description}</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => setModal("invite")}><Icon>♧</Icon> Invite members</button><button className="primary-button" onClick={() => setModal("notice")}><span>+</span> New notice</button></div></div>
        <div className="community-meta"><span><Icon>♙</Icon> {active.members} members</span><span><Icon>◷</Icon> Last activity today</span><button onClick={() => setModal("invite")}>Manage community <span>→</span></button></div>
        <div className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notices..." /></div><div className="filters"><button onClick={() => setFilter("all")} className={filter === "all" ? "chosen" : ""}>All <b>{notices.filter(n => n.communityId === activeId).length}</b></button><button onClick={() => setFilter("pending")} className={filter === "pending" ? "chosen" : ""}>Pending</button><button onClick={() => setFilter("completed")} className={filter === "completed" ? "chosen" : ""}>Completed</button></div></div>
        <div className="feed-header"><span>{filter === "all" ? "Recent notices" : `${filter[0].toUpperCase()}${filter.slice(1)} notices`}</span><span className="sort">Newest first <span>⌄</span></span></div>
        <div className="notice-list">{activeNotices.length ? activeNotices.map((n) => <article className={`notice-card ${n.completed ? "is-complete" : ""}`} key={n.id}><div className="notice-card-top"><span className={`notice-tag ${n.tag === "ACTION REQUIRED" ? "required" : n.tag === "IMPORTANT" ? "important" : "update"}`}>{n.tag}</span><button className="more-button" aria-label="More options">•••</button></div><h2>{n.title}</h2><h3>{n.subtitle}</h3><p>{n.body}</p><div className="notice-resources">{n.links?.map((l) => <button key={l} className="resource link"><span>↗</span>{l}</button>)}{n.attachment && <button className="resource"><span>⌑</span>{n.attachment}<small>PDF · 1.2 MB</small></button>}</div><div className="notice-footer"><div className="author"><span className="avatar author-avatar">{n.author.split(" ").map(x => x[0]).join("")}</span><span>Posted by <strong>{n.author}</strong><small>{n.date}</small></span></div><div className="notice-actions">{(activeId === "apartment" || activeId === "college") && <span className="ack-count">{n.acknowledgements}/{active.members} acknowledged</span>}<button onClick={() => !n.completed && acknowledge(n.id)} className={`ack-button ${n.completed ? "done" : ""}`}>{n.completed ? "✓ Completed" : n.action}</button></div></div></article>) : <div className="empty-state"><div className="empty-icon">⌕</div><h2>No notices found</h2><p>Try a different search or filter.</p></div>}</div>
      </div>
    </section>
    {modal && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}><div className="modal" role="dialog" aria-modal="true">{modal === "notice" && <><div className="modal-header"><div><div className="eyebrow">NEW NOTICE</div><h2>Share an update</h2></div><button onClick={() => setModal(null)} className="close">×</button></div><form onSubmit={createNotice}><label>Title<input name="title" required maxLength={100} placeholder="e.g. Annual maintenance payment" /></label><label>Subheading<input name="subtitle" maxLength={200} placeholder="A short line of context" /></label><label>Description<textarea name="body" required rows={4} placeholder="Write the details your community needs to know..." /></label><div className="form-row"><label>Action button label<input name="action" defaultValue="Mark as read" /></label><label>Attachment<input type="file" /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button">Publish notice</button></div></form></>}{modal === "community" && <><div className="modal-header"><div><div className="eyebrow">NEW COMMUNITY</div><h2>Create a community</h2></div><button onClick={() => setModal(null)} className="close">×</button></div><form onSubmit={(e) => { e.preventDefault(); setModal(null); setToast("Community created — invite your first members."); window.setTimeout(() => setToast(""), 2800); }}><label>Community name<input required placeholder="e.g. Office, apartment, club..." /></label><label>Description<textarea rows={3} placeholder="What is this community for?" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button">Create community</button></div></form></>}{modal === "invite" && <><div className="modal-header"><div><div className="eyebrow">GROW YOUR COMMUNITY</div><h2>Invite members</h2></div><button onClick={() => setModal(null)} className="close">×</button></div><p className="modal-copy">Bring everyone into <strong>{active.name}</strong>. Share this invite link or send it directly by email.</p><div className="invite-link"><input readOnly value={`noticeboard.app/join/${active.id}-x7k2`} /><button onClick={() => { navigator.clipboard?.writeText(`noticeboard.app/join/${active.id}-x7k2`); setToast("Invite link copied."); setModal(null); }}>Copy</button></div><div className="invite-or"><span>or invite by email</span></div><form onSubmit={(e) => { e.preventDefault(); setModal(null); setToast("Invitation sent."); window.setTimeout(() => setToast(""), 2800); }}><label>Email address<input type="email" required placeholder="person@example.com" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button">Send invite</button></div></form></>}</div></div>}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}
