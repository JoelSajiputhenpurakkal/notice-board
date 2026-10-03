// Client Synchronization Manager
// Implements offline-first queueing, push/pull sync, and cursor management

import { db, type LocalGroup, type LocalNotice, type SyncQueueItem } from "./db";
import { request, pingBackend, usesRemoteBackend } from "./api";

export type SyncStatus = "synced" | "syncing" | "offline" | "error";

export interface SyncState {
  status: SyncStatus;
  isOnline: boolean;
  pendingCount: number;
  lastSyncedAt: Date | null;
  errorMessage?: string;
}

type SyncListener = (state: SyncState) => void;

class SyncManager {
  // Browser connectivity does not mean the Spring API is reachable. Start offline
  // until its health endpoint confirms the backend is available.
  private isOnline = false;
  private isSyncing: boolean = false;
  private listeners: Set<SyncListener> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private lastSyncedAt: Date | null = null;
  private errorMessage?: string;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleNetworkChange(true));
      window.addEventListener("offline", () => this.handleNetworkChange(false));
      // Start periodic sync loop
      // Recheck the backend periodically; do not retry push/pull while it is down.
      this.timer = setInterval(() => this.checkConnectivityAndSync(), 60000);
      // Run initial check
      setTimeout(() => this.checkConnectivityAndSync(), 1000);
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.notifyState();
    return () => this.listeners.delete(listener);
  }

  private async notifyState() {
    if (!db) return;
    const pendingCount = await db.sync_queue.where("status").equals("PENDING").count().catch(() => 0);
    let status: SyncStatus = "synced";
    if (!this.isOnline) {
      status = "offline";
    } else if (this.isSyncing) {
      status = "syncing";
    } else if (this.errorMessage) {
      status = "error";
    }

    const state: SyncState = {
      status,
      isOnline: this.isOnline,
      pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      errorMessage: this.errorMessage
    };

    this.listeners.forEach((listener) => listener(state));
  }

  private async handleNetworkChange(online: boolean) {
    this.isOnline = online;
    if (online) {
      const serverReachable = await pingBackend();
      this.isOnline = serverReachable;
      if (serverReachable) {
        await this.triggerSync();
      }
    }
    this.notifyState();
  }

  public async checkConnectivityAndSync() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.isOnline = false;
      this.notifyState();
      return;
    }
    const reachable = await pingBackend();
    this.isOnline = reachable;
    this.notifyState();
    if (reachable) {
      await this.triggerSync();
    }
  }

  // --- Queueing Operations ---

  public async queueNoticeCreation(notice: LocalNotice) {
    if (!db) return;
    // 1. Write locally to Dexie immediately
    await db.notices.put(notice);

    // 2. Queue mutation
    const operation: SyncQueueItem = {
      operationId: crypto.randomUUID(),
      operationType: "CREATE_NOTICE",
      entityId: notice.id,
      groupId: notice.groupId,
      payload: JSON.stringify({
        id: notice.id,
        groupId: notice.groupId,
        title: notice.title,
        subtitle: notice.subtitle,
        body: notice.body,
        action: notice.action
      }),
      status: "PENDING",
      retryCount: 0,
      createdAt: Date.now()
    };

    await db.sync_queue.add(operation);
    this.notifyState();

    // 3. Trigger sync if online
    if (this.isOnline) {
      this.triggerSync();
    }
  }

  public async queueNoticeAcknowledgement(noticeId: string, groupId?: string) {
    if (!db) return;
    // 1. Mark completed locally in Dexie
    const notice = await db.notices.get(noticeId);
    if (notice) {
      notice.completed = true;
      notice.acknowledgements = (notice.acknowledgements || 0) + 1;
      await db.notices.put(notice);
    }

    // 2. Queue mutation
    const operation: SyncQueueItem = {
      operationId: crypto.randomUUID(),
      operationType: "ACKNOWLEDGE_NOTICE",
      entityId: noticeId,
      groupId,
      payload: JSON.stringify({ noticeId }),
      status: "PENDING",
      retryCount: 0,
      createdAt: Date.now()
    };

    await db.sync_queue.add(operation);
    this.notifyState();

    if (this.isOnline) {
      this.triggerSync();
    }
  }

  public async queueGroupCreation(group: LocalGroup) {
    if (!db) return;
    // 1. Save locally
    await db.groups.put(group);

    // 2. Queue mutation
    const operation: SyncQueueItem = {
      operationId: crypto.randomUUID(),
      operationType: "CREATE_GROUP",
      entityId: group.id,
      payload: JSON.stringify({
        id: group.id,
        name: group.name,
        description: group.description
      }),
      status: "PENDING",
      retryCount: 0,
      createdAt: Date.now()
    };

    await db.sync_queue.add(operation);
    this.notifyState();

    if (this.isOnline) {
      this.triggerSync();
    }
  }

  // --- Synchronization Engine (Push + Pull) ---

  public async triggerSync(): Promise<void> {
    if (this.isSyncing || !db || !this.isOnline) return;
    this.isSyncing = true;
    this.errorMessage = undefined;
    this.notifyState();

    try {
      // Step A: Push pending local changes to Spring Boot
      await this.pushPendingOperations();

      // Step B: Pull remote changes from Spring Boot
      await this.pullRemoteChanges();

      this.lastSyncedAt = new Date();
    } catch (error: any) {
      this.errorMessage = error.message;
      // If network failed, mark offline
      if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
        this.isOnline = false;
      }
    } finally {
      this.isSyncing = false;
      this.notifyState();
    }
  }

  private async pushPendingOperations() {
    if (!db) return;
    const pendingItems = await db.sync_queue.where("status").equals("PENDING").toArray();
    if (!pendingItems.length) return;

    const operationsPayload = pendingItems.map((item) => ({
      operationId: item.operationId,
      operationType: item.operationType,
      entityId: item.entityId,
      groupId: item.groupId,
      payload: item.payload,
      clientTimestamp: item.createdAt
    }));

    try {
      const response = await request<{
        results: Array<{ operationId: string; status: string; entityId: string; error?: string }>;
      }>("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({ operations: operationsPayload })
      });

      if (response && response.results) {
        for (const res of response.results) {
          const queueItem = pendingItems.find((p) => p.operationId === res.operationId);
          if (queueItem && queueItem.id) {
            if (res.status === "COMMITTED" || res.status === "DUPLICATE") {
              await db.sync_queue.delete(queueItem.id);
              // Update notice syncStatus in local DB if applicable
              if (queueItem.operationType === "CREATE_NOTICE") {
                const notice = await db.notices.get(queueItem.entityId);
                if (notice) {
                  notice.syncStatus = "synced";
                  await db.notices.put(notice);
                }
              }
            } else {
              queueItem.status = "FAILED";
              queueItem.error = res.error;
              await db.sync_queue.put(queueItem);
            }
          }
        }
      }
    } catch (e: any) {
      // Increment retries on transient network failures
      for (const item of pendingItems) {
        if (item.id) {
          item.retryCount += 1;
          item.lastAttempt = Date.now();
          await db.sync_queue.put(item);
        }
      }
      throw e;
    }
  }

  private async pullRemoteChanges() {
    if (!db) return;
    // Get cursor
    const metaRecord = await db.sync_meta.get("last_sync_cursor");
    const cursor = metaRecord ? Number(metaRecord.value) : 0;

    try {
      const pullResponse = await request<{
        latestCursor: number;
        changes: Array<{
          cursor: number;
          entityType: "GROUP" | "NOTICE" | "ACK" | "MEMBER";
          entityId: string;
          groupId?: string;
          operation: "CREATE" | "UPDATE" | "DELETE";
          payload: string;
          createdAt: string;
        }>;
      }>(`/api/sync/pull?cursor=${cursor}`);

      if (pullResponse && pullResponse.changes) {
        for (const change of pullResponse.changes) {
          try {
            const data = JSON.parse(change.payload);
            if (change.entityType === "GROUP" && change.operation === "DELETE") {
              const groupId = data.id || change.entityId;
              await db.groups.delete(groupId);
              await db.notices.where("groupId").equals(groupId).delete();
              await db.memberships.where("groupId").equals(groupId).delete();
              await db.sync_queue.where("groupId").equals(groupId).delete();
              await db.sync_queue.where("entityId").equals(groupId).delete();
            } else if (change.entityType === "GROUP") {
              // Group change-log payloads are shared across members and may contain
              // the creator's ADMIN role. Keep the role from this user's membership
              // response instead of copying another user's role from the change log.
              const existingGroup = await db.groups.get(data.id);
              if (existingGroup) {
                await db.groups.put({
                  ...existingGroup,
                  name: data.name || existingGroup.name,
                  description: data.description ?? existingGroup.description,
                  memberCount: data.memberCount || existingGroup.memberCount,
                  createdAt: data.createdAt || existingGroup.createdAt || change.createdAt
                });
              }
            } else if (change.entityType === "NOTICE" && change.operation === "DELETE") {
              const noticeId = data.id || change.entityId;
              await db.notices.delete(noticeId);
              await db.sync_queue.where("entityId").equals(noticeId).delete();
            } else if (change.entityType === "NOTICE") {
              const existing = await db.notices.get(data.id);
              await db.notices.put({
                id: data.id,
                groupId: data.groupId || change.groupId || "",
                authorId: data.authorId || "",
                author: data.author || "Member",
                title: data.title,
                subtitle: data.subtitle || "",
                body: data.body,
                action: data.action || "Mark as read",
                createdAt: data.createdAt || change.createdAt,
                acknowledgements: data.acknowledgements || (existing ? existing.acknowledgements : 0),
                completed: existing ? existing.completed : false,
                syncStatus: "synced"
              });
            } else if (change.entityType === "ACK") {
              if (data.noticeId) {
                const notice = await db.notices.get(data.noticeId);
                if (notice) {
                  notice.acknowledgements = (notice.acknowledgements || 0) + 1;
                  await db.notices.put(notice);
                }
              }
            }
          } catch {
            // Ignore individual payload parse failure
          }
        }

        // Advance cursor
        if (pullResponse.latestCursor) {
          await db.sync_meta.put({
            key: "last_sync_cursor",
            value: pullResponse.latestCursor
          });
        }
      }
    } catch (e) {
      throw e;
    }
  }

  // Initial populate cache from server when user signs in
  public async seedLocalCache(user: any) {
    if (!db || !this.isOnline) return;
    try {
      if (!usesRemoteBackend) {
        const communitiesData = await request<{ communities: any[] }>("/api/communities").catch(() => null);
        if (communitiesData?.communities) {
          for (const community of communitiesData.communities) {
            await db.groups.put({
              id: community.id,
              name: community.name,
              description: community.description || "",
              role: community.role || "MEMBER",
              memberCount: community.members || 1,
              createdAt: community.createdAt || new Date().toISOString()
            });
          }
        }

        const localGroups = await db.groups.toArray();
        for (const group of localGroups) {
          const noticesData = await request<{ notices: any[] }>(
            `/api/notices?communityId=${encodeURIComponent(group.id)}`
          ).catch(() => null);
          if (!noticesData?.notices) continue;
          for (const notice of noticesData.notices) {
            await db.notices.put({
              id: notice.id,
              groupId: group.id,
              authorId: notice.authorId || "",
              author: notice.author || "Member",
              title: notice.title,
              subtitle: notice.subtitle || "",
              body: notice.body,
              action: notice.action || "Mark as read",
              createdAt: notice.createdAt,
              acknowledgements: notice.acknowledgements || 0,
              completed: Boolean(notice.completed),
              syncStatus: "synced"
            });
          }
        }
        return;
      }

      // 1. Fetch groups from the configured Spring Boot API.
      const groupsData = await request<{ groups: any[] }>("/api/groups").catch(() => null);
      if (groupsData?.groups) {
        for (const g of groupsData.groups) {
          await db.groups.put({
            id: g.id,
            name: g.name,
            description: g.description || "",
            role: g.role || "MEMBER",
            memberCount: g.memberCount || 1,
            createdAt: g.createdAt || new Date().toISOString()
          });
        }
      }

      // 2. Fetch notices for all groups
      const allGroups = await db.groups.toArray();
      for (const g of allGroups) {
        const noticesData = await request<{ notices: any[] }>(`/api/notices?groupId=${encodeURIComponent(g.id)}`).catch(() => null);
        if (noticesData?.notices) {
          for (const n of noticesData.notices) {
            await db.notices.put({
              id: n.id,
              groupId: g.id,
              authorId: n.authorId || "",
              author: n.author || "Member",
              title: n.title,
              subtitle: n.subtitle || "",
              body: n.body,
              action: n.action || "Mark as read",
              createdAt: n.createdAt,
              acknowledgements: n.acknowledgements || 0,
              completed: Boolean(n.completed),
              syncStatus: "synced"
            });
          }
        }
      }
    } catch {
      // Offline fallback: rely on whatever is already in Dexie
    }
    this.notifyState();
  }
}

export const syncManager = typeof window !== "undefined" ? new SyncManager() : (null as unknown as SyncManager);
