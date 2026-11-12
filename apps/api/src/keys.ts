import type { webcrypto } from "node:crypto"
import { generateKeyPair } from "@scanuganda/core"

/**
 * Private signing keys. The API only needs them to sign new codes; verification uses
 * the public halves in `signing_keys`. Three stores:
 *   - FileKeyStore (`keys-file.ts`): one file per key, outside the database. Node hosts.
 *   - SealedKeyStore: in the database, encrypted with KEY_ENCRYPTION_KEY, which lives
 *     only in the host's secret store. For hosts without a disk (Cloudflare Workers).
 *   - MemoryKeyStore: tests.
 *
 * Every call receives the caller's `KeyRows` (a Store, possibly inside a transaction),
 * so a sealed key is written in the same transaction as its public half.
 */

export interface KeyRows {
  putSealedKey(keyId: string, sealed: string): Promise<void>
  sealedKey(keyId: string): Promise<string | undefined>
}

export interface KeyStore {
  /** Creates and stores a new key pair under `keyId`; returns the public half (hex). */
  create(keyId: string, rows: KeyRows): Promise<string>
  /** Private key (hex), or undefined if this server does not hold it. */
  getPrivate(keyId: string, rows: KeyRows): Promise<string | undefined>
}

export const SAFE_KEY_ID = /^[A-Za-z0-9_-]+$/

export class MemoryKeyStore implements KeyStore {
  private keys = new Map<string, string>()
  async create(keyId: string): Promise<string> {
    if (this.keys.has(keyId)) throw new Error(`Key ${keyId} already exists`)
    const pair = generateKeyPair()
    this.keys.set(keyId, pair.privateKey)
    return pair.publicKey
  }
  async getPrivate(keyId: string): Promise<string | undefined> {
    return this.keys.get(keyId)
  }
}

/* ---------- sealed (encrypted) keys in the database ---------- */

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const fromB64url = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s)

/**
 * AES-256-GCM with a key derived from KEY_ENCRYPTION_KEY. The key id is bound in as
 * additional data, so a sealed row copied onto another id does not decrypt.
 * Format: `v1.<iv>.<ciphertext>` (base64url). Web Crypto only: runs on Node and Workers.
 */
export class SealedKeyStore implements KeyStore {
  private aes: Promise<webcrypto.CryptoKey>

  constructor(secret: string) {
    if (secret.length < 32) throw new Error("KEY_ENCRYPTION_KEY must be at least 32 characters")
    this.aes = crypto.subtle
      .digest("SHA-256", utf8(`scanuganda-signing-keys|${secret}`))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]))
  }

  async create(keyId: string, rows: KeyRows): Promise<string> {
    if (!SAFE_KEY_ID.test(keyId)) throw new Error("Unsafe key id")
    if (await rows.sealedKey(keyId)) throw new Error(`Key ${keyId} already exists`)
    const pair = generateKeyPair()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(keyId) }, await this.aes, utf8(pair.privateKey))
    await rows.putSealedKey(keyId, `v1.${b64url(iv)}.${b64url(new Uint8Array(ct))}`)
    return pair.publicKey
  }

  async getPrivate(keyId: string, rows: KeyRows): Promise<string | undefined> {
    const sealed = await rows.sealedKey(keyId)
    if (!sealed) return undefined
    const [v, iv, ct] = sealed.split(".")
    if (v !== "v1" || !iv || !ct) throw new Error(`Sealed key ${keyId} is malformed`)
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv), additionalData: utf8(keyId) }, await this.aes, fromB64url(ct))
      return new TextDecoder().decode(plain)
    } catch {
      throw new Error(`Sealed key ${keyId} does not decrypt: is KEY_ENCRYPTION_KEY the one it was created with?`)
    }
  }
}
