"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { db, type LocalGroup, type LocalNotice } from "@/lib/db";
import { syncManager, type SyncState } from "@/lib/sync";
import { getToken, request, setToken, usesRemoteBackend } from "@/lib/api";

type User = { id: string; name: string; email: string };

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [communities, setCommunities] = useState<LocalGroup[]>([]);
  const [activeId, setActiveId] = useState("");
  const [notices, setNotices] = useState<LocalNotice[]>([]);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>({
    status: "synced",
    isOnline: true,
    pendingCount: 0,
    lastSyncedAt: null
  });

  const active = communities.find((c) => c.id === activeId) || communities[0];
  const canDeleteActiveGroup = Boolean(user && active?.role === "ADMIN");

  // Load groups from local IndexedDB
  const loadCommunities = useCallback(async () => {
    if (!db) return;
    const localGroups = await db.groups.orderBy("createdAt").toArray();
    setCommunities(localGroups);
    setActiveId((current) =>
      localGroups.some((c: LocalGroup) => c.id === current) ? current : localGroups[0]?.id || ""
    );
  }, []);

  const acceptInvite = useCallback(async (token: string) => {
    let groupId: string;
    let groupName = "this group";
    if (usesRemoteBackend) {
      const data = await request<{ group: LocalGroup }>(`/api/groups/invites/${encodeURIComponent(token)}/join`, {
        method: "POST"
      });
      groupId = data.group.id;
      groupName = data.group.name;
      if (db) await db.groups.put(data.group);
      const remoteNotices = await request<{ notices: Omit<LocalNotice, "syncStatus">[] }>(
        `/api/notices?groupId=${encodeURIComponent(groupId)}`
      ).catch(() => null);
      if (db && remoteNotices?.notices) {
        for (const notice of remoteNotices.notices) {
          await db.notices.put({ ...notice, syncStatus: "synced" });
        }
      }
    } else {
      const data = await request<{ communityId: string }>(`/api/invites/${encodeURIComponent(token)}/join`, {
        method: "POST"
      });
      groupId = data.communityId;
      const communitiesData = await request<{ communities: Array<LocalGroup & { members?: number }> }>("/api/communities");
      const joinedGroup = communitiesData.communities.find((community) => community.id === groupId);
      if (joinedGroup) {
        groupName = joinedGroup.name;
        if (db) await db.groups.put({ ...joinedGroup, memberCount: joinedGroup.members ?? joinedGroup.memberCount });
      }
    }
    await syncManager?.seedLocalCache(null);
    await loadCommunities();
    setActiveId(groupId);
    window.history.replaceState({}, "", "/");
    setToast(`You joined ${groupName}.`);
  }, [loadCommunities]);

  // Load notices for active group from local IndexedDB
  const loadNotices = useCallback(async (id: string) => {
    if (!id || !db) {
      setNotices([]);
      return;
    }
    const localNotices = await db.notices.where("groupId").equals(id).toArray();
    localNotices.sort((a: LocalNotice, b: LocalNotice) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setNotices(localNotices);
  }, []);

  // Initialize session and sync manager listeners
  useEffect(() => {
    let unsubscribeSync: (() => void) | undefined;
    if (syncManager) {
      unsubscribeSync = syncManager.subscribe((state: SyncState) => {
        setSyncState(state);
      });
    }

    async function initUser() {
      // 1. Try server check
      try {
        const data = await request<{ user: User }>("/api/auth/me");
        if (data.user) {
          setUser(data.user);
          if (db) await db.sync_meta.put({ key: "auth_user", value: data.user });
          await syncManager?.seedLocalCache(data.user);
          await loadCommunities();
          const invite = new URLSearchParams(window.location.search).get("invite");
          if (invite) {
            try {
              await acceptInvite(invite);
            } catch (e: any) {
              setError(e.message || "Could not join with this invitation.");
            }
          } else {
            const groupId = new URLSearchParams(window.location.search).get("group");
            if (groupId) setActiveId(groupId);
          }
          return;
        }
      } catch {
        // Offline or unauthenticated
      }

      // 2. Offline fallback: check cached user in Dexie
      if (db) {
        const cachedUser = await db.sync_meta.get("auth_user");
        const invite = new URLSearchParams(window.location.search).get("invite");
        if (cachedUser?.value && !(invite && !getToken())) {
          setUser(cachedUser.value);
          await loadCommunities();
          if (invite) {
            try {
              await acceptInvite(invite);
            } catch (e: any) {
              setError(e.message || "Could not join with this invitation.");
            }
          }
        }
      }
    }

    initUser();

    return () => {
      if (unsubscribeSync) unsubscribeSync();
    };
  }, [acceptInvite, loadCommunities]);

  // Sync notices when active group changes or when syncState changes
  useEffect(() => {
    loadNotices(activeId).catch((e) => setError(e.message));
  }, [activeId, loadNotices, syncState.status, syncState.pendingCount]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload: any = {
        email: form.get("email"),
        password: form.get("password")
      };
      if (mode === "register") {
        payload.name = form.get("name");
      }

      const data = await request<{ user: User; token?: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (data.token) {
        setToken(data.token);
      }
      setUser(data.user);
      if (db) await db.sync_meta.put({ key: "auth_user", value: data.user });
      await syncManager?.seedLocalCache(data.user);
      const invite = new URLSearchParams(window.location.search).get("invite");
      if (invite) {
        try {
          await acceptInvite(invite);
        } catch (e: any) {
          await loadCommunities();
          setError(e.message || "Signed in, but could not join with this invitation.");
        }
      } else {
        await loadCommunities();
      }
    } catch (e: any) {
      setError(e.message || "Authentication failed.");
    }
  }

  async function createCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();

    if (name.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }

    try {
      const newGroup: LocalGroup = {
        id: crypto.randomUUID(),
        name,
        description,
        role: "ADMIN",
        memberCount: 1,
        createdAt: new Date().toISOString()
      };

      await syncManager?.queueGroupCreation(newGroup);
      await loadCommunities();
      setActiveId(newGroup.id);
      formElement.reset();
      setToast(
        syncState.isOnline
          ? "Community created."
          : "Community created offline (queued for sync)."
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function inviteMembers() {
    if (!active || active.role !== "ADMIN") return;
    setError("");
    try {
      const invite = usesRemoteBackend
        ? await request<{ token: string }>(`/api/groups/${encodeURIComponent(active.id)}/invites`, { method: "POST" })
        : await request<{ url: string }>(`/api/communities/${encodeURIComponent(active.id)}/invites`, { method: "POST" });
      const url = "token" in invite
        ? new URL(`/join/${invite.token}`, window.location.origin).toString()
        : invite.url;
      try {
        await navigator.clipboard.writeText(url);
        setToast("Invite link copied. It expires in 7 days.");
      } catch {
        window.prompt("Copy this invite link (expires in 7 days):", url);
      }
    } catch (e: any) {
      setError(e.message || "Could not create an invite link.");
    }
  }

  async function deleteActiveGroup() {
    if (!active || active.role !== "ADMIN") return;
    const groupId = active.id;
    if (!window.confirm(`Delete “${active.name}” and all of its notices, members, and invite links? This cannot be undone.`)) return;
    setError("");
    try {
      const endpoint = usesRemoteBackend ? `/api/groups/${encodeURIComponent(groupId)}` : `/api/communities/${encodeURIComponent(groupId)}`;
      await request(endpoint, { method: "DELETE" });
      if (db) {
        await db.notices.where("groupId").equals(groupId).delete();
        await db.memberships.where("groupId").equals(groupId).delete();
        await db.sync_queue.where("groupId").equals(groupId).delete();
        await db.sync_queue.where("entityId").equals(groupId).delete();
        await db.groups.delete(groupId);
      }
      setNotices([]);
      await loadCommunities();
      const remaining = db ? await db.groups.orderBy("createdAt").toArray() : [];
      setActiveId(remaining[0]?.id || "");
      setToast("Group deleted.");
    } catch (e: any) {
      setError(e.message || "Could not delete the group.");
    }
  }

  async function deleteNotice(notice: LocalNotice) {
    if (!user || notice.authorId !== user.id) return;
    if (!window.confirm(`Delete “${notice.title}”? It will be removed for all group members.`)) return;
    setError("");
    try {
      if (notice.syncStatus === "pending") {
        if (!db) return;
        await db.notices.delete(notice.id);
        await db.sync_queue.where("entityId").equals(notice.id).delete();
      } else {
        await request(`/api/notices/${encodeURIComponent(notice.id)}`, { method: "DELETE" });
        if (db) {
          await db.notices.delete(notice.id);
          await db.sync_queue.where("entityId").equals(notice.id).delete();
        }
      }
      await loadNotices(activeId);
      setToast("Notice deleted.");
    } catch (e: any) {
      setError(e.message || "Could not delete the notice.");
    }
  }

  async function createNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!user || !activeId) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
    const subtitle = String(form.get("subtitle") || "").trim();
    const body = String(form.get("body") || "").trim();
    const action = String(form.get("action") || "Mark as read").trim();

    if (title.length < 3 || !body) {
      setError("Please provide a title (min 3 chars) and body.");
      return;
    }

    try {
      const newNotice: LocalNotice = {
        id: crypto.randomUUID(),
        groupId: activeId,
        authorId: user.id,
        author: user.name,
        title,
        subtitle,
        body,
        action,
        createdAt: new Date().toISOString(),
        acknowledgements: 0,
        completed: false,
        syncStatus: syncState.isOnline ? "synced" : "pending"
      };

      // Optimistic instant write to IndexedDB & queue sync operation
      await syncManager?.queueNoticeCreation(newNotice);
      formElement.reset();
      await loadNotices(activeId);
      setToast(
        syncState.isOnline
          ? "Notice published."
          : "Notice published locally (queued for sync)."
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function acknowledge(id: string) {
    try {
      await syncManager?.queueNoticeAcknowledgement(id, activeId);
      await loadNotices(activeId);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function logout() {
    setToken(null);
    setUser(null);
    setCommunities([]);
    setNotices([]);
    if (db) await db.sync_meta.delete("auth_user");
  }

  if (!user) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <div className="brand">
            <div className="brand-mark">N</div>
            <span>
              Notice<span className="brand-accent">Board</span>
            </span>
          </div>
          <p className="eyebrow">OFFLINE-FIRST NOTICE BOARD</p>
          <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p>Read, publish, and sync notices seamlessly even when offline.</p>
          <form onSubmit={authenticate}>
            {mode === "register" && (
              <label>
                Your name
                <input name="name" required minLength={2} maxLength={80} autoComplete="name" />
              </label>
            )}
            <label>
              Email address
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={mode === "register" ? 8 : 1}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
              {mode === "register" && <small>Use at least 8 characters.</small>}
            </label>
            {error && <p className="error-note">{error}</p>}
            <button className="primary-button full-button">
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? "New to NoticeBoard?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </section>
      </main>
    );
  }

  const filteredNotices = notices.filter((n) =>
    (n.title + " " + (n.subtitle || "") + " " + n.body)
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <main className="app-shell">
      <aside className={"sidebar " + (sidebarOpen ? "open" : "")}>
        <div className="brand">
          <div className="brand-mark">N</div>
          <span>
            Notice<span className="brand-accent">Board</span>
          </span>
        </div>
        <p className="side-label">Your groups</p>
        <nav className="side-communities">
          {communities.map((c) => (
            <button
              key={c.id}
              className={"side-community " + (c.id === activeId ? "selected" : "")}
              onClick={() => {
                setActiveId(c.id);
                setSidebarOpen(false);
              }}
            >
              {c.name}
            </button>
          ))}
        </nav>
        <form className="community-form" onSubmit={createCommunity}>
          <h3>Start a group</h3>
          <label>
            Name
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="e.g. Engineering Team"
            />
          </label>
          <label>
            Description
            <input name="description" maxLength={300} placeholder="What is it for?" />
          </label>
          <button className="secondary-button">Create group</button>
        </form>
        <div className="sidebar-bottom">
          <div className="profile-mini">
            <div className="avatar user">
              {user.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
          <button className="nav-item" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <section className="content-area">
        <header className={"topbar " + (sidebarOpen ? "menu-open" : "")}>
          <button
            className="mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰
          </button>
          <div className="breadcrumb">
            <span className="muted">Groups</span>
            <span className="chevron">›</span>
            <strong>{active?.name || "Overview"}</strong>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Live Offline/Online Sync Badge */}
            <button
              className={"sync-badge " + syncState.status}
              onClick={() => syncManager?.triggerSync()}
              title={
                syncState.isOnline
                  ? "Click to sync changes immediately"
                  : "Working offline. Changes will sync automatically when reconnected."
              }
            >
              <span className="sync-dot" />
              <span>
                {syncState.status === "offline"
                  ? `Offline · ${syncState.pendingCount} queued`
                  : syncState.status === "syncing"
                  ? `Syncing (${syncState.pendingCount})...`
                  : syncState.status === "error"
                  ? "Sync error (retry)"
                  : "Online · Synced"}
              </span>
            </button>

            <span className="top-name">{user.name}</span>
          </div>
        </header>

        <div className="page-content">
          {error && (
            <p className="error-note">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </p>
          )}

          {active ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">GROUP NOTICE BOARD</div>
                  <h1>{active.name}</h1>
                  <p>{active.description || "Updates, actions, and offline-ready notices."}</p>
                </div>
                {active.role === "ADMIN" && (
                  <div className="group-actions">
                    <button className="primary-button" onClick={inviteMembers}>Invite members</button>
                    {canDeleteActiveGroup && <button className="danger-button" onClick={deleteActiveGroup}>Delete group</button>}
                  </div>
                )}
              </div>

              <div className="toolbar">
                <div className="search">
                  <span>⌕</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search cached notices..."
                  />
                </div>
                <span>{notices.length} notices</span>
              </div>

              {active.role === "ADMIN" && (
                <form className="notice-form" onSubmit={createNotice}>
                  <h2>Publish a notice</h2>
                  <label>
                    Title
                    <input
                      name="title"
                      required
                      minLength={3}
                      maxLength={120}
                      placeholder="What should members know?"
                    />
                  </label>
                  <label>
                    Summary
                    <input name="subtitle" maxLength={200} placeholder="Optional short summary" />
                  </label>
                  <label>
                    Details
                    <textarea
                      name="body"
                      required
                      maxLength={10000}
                      rows={4}
                      placeholder="Write your notice details. Works seamlessly offline."
                    />
                  </label>
                  <label>
                    Action button label
                    <input name="action" maxLength={40} defaultValue="Mark as read" />
                  </label>
                  <button className="primary-button">Publish notice</button>
                </form>
              )}

              <div className="notice-list">
                {filteredNotices.length ? (
                  filteredNotices.map((n) => (
                    <article className="notice-card" key={n.id}>
                      <div className="notice-card-top">
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className="notice-tag update">NOTICE</span>
                          {n.syncStatus === "pending" && (
                            <span className="notice-tag pending-sync">QUEUED OFFLINE</span>
                          )}
                        </div>
                        <div className="notice-top-actions">
                          <span className="muted">{new Date(n.createdAt).toLocaleDateString()}</span>
                          {user && n.authorId === user.id && (
                            <button className="delete-notice-button" onClick={() => deleteNotice(n)}>Delete</button>
                          )}
                        </div>
                      </div>
                      <h2>{n.title}</h2>
                      {n.subtitle && <h3>{n.subtitle}</h3>}
                      <p>{n.body}</p>
                      <div className="notice-footer">
                        <div className="author">
                          <strong>{n.author}</strong>
                          <small>{n.acknowledgements} acknowledged</small>
                        </div>
                        <button
                          className={"ack-button " + (n.completed ? "done" : "")}
                          disabled={n.completed}
                          onClick={() => acknowledge(n.id)}
                        >
                          {n.completed ? "✓ Acknowledged" : n.action}
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <h2>{notices.length ? "No notices match your search" : "No notices yet"}</h2>
                    <p>
                      {notices.length
                        ? "Try another search."
                        : "Notices will appear here, available even when offline."}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state welcome-empty">
              <h1>Welcome to NoticeBoard</h1>
              <p>Create a group to publish updates and collaborate offline or online.</p>
            </div>
          )}
        </div>
      </section>

      {toast && (
        <div className="toast">
          <span>✓</span>
          {toast}
          <button onClick={() => setToast("")}>×</button>
        </div>
      )}
    </main>
  );
}
