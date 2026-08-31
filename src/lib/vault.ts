import { kv } from "./db"

/**
 * Two-tier secret storage. Secrets are always encrypted at rest with a
 * non-extractable device key held in IndexedDB; enabling the vault re-wraps
 * them with a PBKDF2 key derived from a passphrase that never leaves memory.
 */
type Envelope = { mode: "device" | "vault"; iv: number[]; data: number[] }

const enc = new TextEncoder()
const dec = new TextDecoder()
let vaultKey: CryptoKey | null = null

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deviceKey(): Promise<CryptoKey> {
  const existing = await kv.get<CryptoKey>("deviceKey")
  if (existing) return existing
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ])
  await kv.set("deviceKey", key)
  return key
}

export async function deriveVaultKey(passphrase: string, saltB64: string) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ])
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: unb64(saltB64), iterations: 310_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

async function seal(key: CryptoKey, mode: Envelope["mode"], plain: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain))
  return { mode, iv: [...iv], data: [...new Uint8Array(data)] }
}

async function open(key: CryptoKey, e: Envelope): Promise<string> {
  const out = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(e.iv) },
    key,
    new Uint8Array(e.data)
  )
  return dec.decode(out)
}

const skey = (id: string) => `secret:${id}`

export const vault = {
  get locked() {
    return vaultRequired && !vaultKey
  },
  async setSecret(id: string, value: string) {
    if (!value) return this.delSecret(id)
    const mode: Envelope["mode"] = vaultKey ? "vault" : "device"
    const key = vaultKey ?? (await deviceKey())
    await kv.set(skey(id), await seal(key, mode, value))
  },
  async getSecret(id: string): Promise<string | null> {
    const e = await kv.get<Envelope>(skey(id))
    if (!e) return null
    const key = e.mode === "vault" ? vaultKey : await deviceKey()
    if (!key) throw new Error("Vault is locked")
    try {
      return await open(key, e)
    } catch {
      return null
    }
  },
  async hasSecret(id: string) {
    return (await kv.get<Envelope>(skey(id))) !== undefined
  },
  async delSecret(id: string) {
    await kv.del(skey(id))
  },
  async listSecretIds(): Promise<string[]> {
    const ids: string[] = []
    // kv has no index; enumerate by known prefix through the raw store.
    const d = await (await import("./db")).db()
    let cursor = await d.transaction("kv").store.openCursor()
    while (cursor) {
      const k = String(cursor.key)
      if (k.startsWith("secret:")) ids.push(k.slice(7))
      cursor = await cursor.continue()
    }
    return ids
  },

  /** Turn a passphrase vault on, re-wrapping every existing secret. */
  async enable(passphrase: string) {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)).buffer)
    const key = await deriveVaultKey(passphrase, salt)
    const ids = await this.listSecretIds()
    const plain: [string, string][] = []
    for (const id of ids) {
      const v = await this.getSecret(id)
      if (v) plain.push([id, v])
    }
    vaultKey = key
    vaultRequired = true
    for (const [id, v] of plain) await kv.set(skey(id), await seal(key, "vault", v))
    const check = await seal(key, "vault", "wink-vault-ok")
    return { salt, check: JSON.stringify(check) }
  },

  async unlock(passphrase: string, salt: string, check: string) {
    const key = await deriveVaultKey(passphrase, salt)
    try {
      const ok = await open(key, JSON.parse(check) as Envelope)
      if (ok !== "wink-vault-ok") return false
    } catch {
      return false
    }
    vaultKey = key
    vaultRequired = true
    return true
  },

  lock() {
    vaultKey = null
  },

  /** Re-wrap secrets back onto the device key. */
  async disable() {
    const ids = await this.listSecretIds()
    const plain: [string, string][] = []
    for (const id of ids) {
      const v = await this.getSecret(id)
      if (v) plain.push([id, v])
    }
    const key = await deviceKey()
    for (const [id, v] of plain) await kv.set(skey(id), await seal(key, "device", v))
    vaultKey = null
    vaultRequired = false
  },

  markRequired(required: boolean) {
    vaultRequired = required
  },
}

let vaultRequired = false
