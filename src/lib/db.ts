import { openDB, type DBSchema, type IDBPDatabase } from "idb"

import type {
  Assistant,
  Attachment,
  Chunk,
  Collection,
  Conversation,
  Folder,
  ID,
  KnowledgeDoc,
  MemoryItem,
  Message,
  Preset,
  ProviderConfig,
  ToolCall,
} from "./types"

export interface ToolAuditEntry {
  id: ID
  conversationId: ID
  messageId: ID
  call: ToolCall
  at: number
}

interface WinkDB extends DBSchema {
  conversations: {
    key: ID
    value: Conversation
    indexes: { updatedAt: number; folderId: string }
  }
  messages: {
    key: ID
    value: Message
    indexes: { conversationId: ID; createdAt: number }
  }
  folders: { key: ID; value: Folder }
  assistants: { key: ID; value: Assistant }
  presets: { key: ID; value: Preset }
  providers: { key: ID; value: ProviderConfig }
  memories: { key: ID; value: MemoryItem; indexes: { updatedAt: number } }
  collections: { key: ID; value: Collection }
  docs: { key: ID; value: KnowledgeDoc; indexes: { collectionId: ID } }
  chunks: {
    key: ID
    value: Chunk
    indexes: { docId: ID; collectionId: ID }
  }
  attachments: { key: string; value: { key: string; blob: Blob; meta: Attachment } }
  toolAudit: { key: ID; value: ToolAuditEntry; indexes: { conversationId: ID } }
  kv: { key: string; value: unknown }
}

let dbp: Promise<IDBPDatabase<WinkDB>> | null = null

export function db() {
  if (!dbp) {
    dbp = openDB<WinkDB>("wink", 1, {
      upgrade(d) {
        const c = d.createObjectStore("conversations", { keyPath: "id" })
        c.createIndex("updatedAt", "updatedAt")
        c.createIndex("folderId", "folderId")
        const m = d.createObjectStore("messages", { keyPath: "id" })
        m.createIndex("conversationId", "conversationId")
        m.createIndex("createdAt", "createdAt")
        d.createObjectStore("folders", { keyPath: "id" })
        d.createObjectStore("assistants", { keyPath: "id" })
        d.createObjectStore("presets", { keyPath: "id" })
        d.createObjectStore("providers", { keyPath: "id" })
        d.createObjectStore("memories", { keyPath: "id" }).createIndex(
          "updatedAt",
          "updatedAt"
        )
        d.createObjectStore("collections", { keyPath: "id" })
        d.createObjectStore("docs", { keyPath: "id" }).createIndex(
          "collectionId",
          "collectionId"
        )
        const ch = d.createObjectStore("chunks", { keyPath: "id" })
        ch.createIndex("docId", "docId")
        ch.createIndex("collectionId", "collectionId")
        d.createObjectStore("attachments", { keyPath: "key" })
        d.createObjectStore("toolAudit", { keyPath: "id" }).createIndex(
          "conversationId",
          "conversationId"
        )
        d.createObjectStore("kv")
      },
    })
  }
  return dbp
}

export const uid = (): ID =>
  crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)

/** Generic store facade. One transaction per call; batch with putMany. */
function table<K extends "conversations" | "messages" | "folders" | "assistants" | "presets" | "providers" | "memories" | "collections" | "docs" | "chunks" | "toolAudit">(
  name: K
) {
  type V = WinkDB[K]["value"]
  return {
    async all(): Promise<V[]> {
      return (await db()).getAll(name) as Promise<V[]>
    },
    async get(id: string): Promise<V | undefined> {
      return (await db()).get(name, id) as Promise<V | undefined>
    },
    async put(value: V): Promise<void> {
      await (await db()).put(name, value as never)
    },
    async putMany(values: V[]): Promise<void> {
      const d = await db()
      const tx = d.transaction(name, "readwrite")
      await Promise.all([...values.map((v) => tx.store.put(v as never)), tx.done])
    },
    async del(id: string): Promise<void> {
      await (await db()).delete(name, id)
    },
    async clear(): Promise<void> {
      await (await db()).clear(name)
    },
    async count(): Promise<number> {
      return (await db()).count(name)
    },
  }
}

export const conversations = {
  ...table("conversations"),
  async recent(limit = 500): Promise<Conversation[]> {
    const d = await db()
    const out: Conversation[] = []
    let cursor = await d
      .transaction("conversations")
      .store.index("updatedAt")
      .openCursor(null, "prev")
    while (cursor && out.length < limit) {
      out.push(cursor.value)
      cursor = await cursor.continue()
    }
    return out
  },
}

export const messages = {
  ...table("messages"),
  async byConversation(id: ID): Promise<Message[]> {
    const d = await db()
    const list = await d.getAllFromIndex("messages", "conversationId", id)
    return list.sort((a, b) => a.createdAt - b.createdAt)
  },
  async delByConversation(id: ID): Promise<void> {
    const d = await db()
    const keys = await d.getAllKeysFromIndex("messages", "conversationId", id)
    const tx = d.transaction("messages", "readwrite")
    await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done])
  },
}

export const folders = table("folders")
export const assistants = table("assistants")
export const presets = table("presets")
export const providers = table("providers")
export const memories = table("memories")
export const collections = table("collections")
export const toolAudit = table("toolAudit")

export const docs = {
  ...table("docs"),
  async byCollection(id: ID): Promise<KnowledgeDoc[]> {
    return (await db()).getAllFromIndex("docs", "collectionId", id)
  },
}

export const chunks = {
  ...table("chunks"),
  async byCollection(id: ID): Promise<Chunk[]> {
    return (await db()).getAllFromIndex("chunks", "collectionId", id)
  },
  async byDoc(id: ID): Promise<Chunk[]> {
    return (await db()).getAllFromIndex("chunks", "docId", id)
  },
  async delByDoc(id: ID): Promise<void> {
    const d = await db()
    const keys = await d.getAllKeysFromIndex("chunks", "docId", id)
    const tx = d.transaction("chunks", "readwrite")
    await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done])
  },
}

export const attachments = {
  async put(meta: Attachment, blob: Blob): Promise<void> {
    await (await db()).put("attachments", { key: meta.blobKey, blob, meta })
  },
  async get(key: string): Promise<Blob | undefined> {
    return (await (await db()).get("attachments", key))?.blob
  },
  async del(key: string): Promise<void> {
    await (await db()).delete("attachments", key)
  },
  async all() {
    return (await db()).getAll("attachments")
  },
}

export const kv = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await (await db()).get("kv", key)) as T | undefined
  },
  async set(key: string, value: unknown): Promise<void> {
    await (await db()).put("kv", value, key)
  },
  async del(key: string): Promise<void> {
    await (await db()).delete("kv", key)
  },
}

export async function storageEstimate() {
  const est = await navigator.storage?.estimate?.()
  return { usage: est?.usage ?? 0, quota: est?.quota ?? 0 }
}

export async function wipeAll() {
  const d = await db()
  const names = [...d.objectStoreNames]
  const tx = d.transaction(names as never, "readwrite")
  await Promise.all([...names.map((n) => tx.objectStore(n as never).clear()), tx.done])
}
