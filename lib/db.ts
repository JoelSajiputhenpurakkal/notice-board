import Dexie, { type Table } from "dexie";

export interface LocalGroup {
  id: string;
  name: string;
  description: string;
  role: string;
  memberCount: number;
  createdAt: string;
}

export interface LocalNotice {
  id: string;
  groupId: string;
  authorId: string;
  author: string;
  title: string;
  subtitle: string;
  body: string;
  action: string;
  createdAt: string;
  acknowledgements: number;
  completed: boolean;
  syncStatus: "synced" | "pending" | "failed";
}

export interface LocalMembership {
  id: string;
  userId: string;
  groupId: string;
  role: string;
}

export interface SyncQueueItem {
  id?: number;
  operationId: string; // UUID for idempotency
  operationType: "CREATE_NOTICE" | "ACKNOWLEDGE_NOTICE" | "CREATE_GROUP";
  entityId: string;
  groupId?: string;
  payload: string; // JSON stringified data
  status: "PENDING" | "SYNCING" | "FAILED";
  retryCount: number;
  createdAt: number;
  lastAttempt?: number;
  error?: string;
}

export interface SyncMeta {
  key: string; // e.g. "last_sync_cursor", "last_synced_at", "auth_user"
  value: any;
}

export class NoticeBoardDatabase extends Dexie {
  groups!: Table<LocalGroup, string>;
  notices!: Table<LocalNotice, string>;
  memberships!: Table<LocalMembership, string>;
  sync_queue!: Table<SyncQueueItem, number>;
  sync_meta!: Table<SyncMeta, string>;

  constructor() {
    super("NoticeBoardLocalDB");
    this.version(1).stores({
      groups: "id, name, createdAt",
      notices: "id, groupId, authorId, createdAt, syncStatus",
      memberships: "id, userId, groupId, role",
      sync_queue: "++id, operationId, operationType, entityId, groupId, status, createdAt",
      sync_meta: "key"
    });
  }
}

export const db = typeof window !== "undefined" ? new NoticeBoardDatabase() : (null as unknown as NoticeBoardDatabase);
