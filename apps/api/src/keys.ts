import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { generateKeyPair, type KeyPair } from "@scanuganda/core"

/**
 * Private signing keys never go in the database or in git. The API only needs
 * them to sign new codes; verification uses the public halves in `signing_keys`.
 */
export interface KeyStore {
  /** Creates and stores a new key pair under `keyId`; returns the public half. */
  create(keyId: string): KeyPair["publicKey"]
  /** Private key (hex) or undefined if this server does not hold it. */
  getPrivate(keyId: string): string | undefined
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/

export class FileKeyStore implements KeyStore {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true })
  }
  private path(keyId: string): string {
    if (!SAFE_ID.test(keyId)) throw new Error("Unsafe key id")
    return join(this.dir, `${keyId}.key`)
  }
  create(keyId: string): string {
    const p = this.path(keyId)
    if (existsSync(p)) throw new Error(`Key ${keyId} already exists`)
    const pair = generateKeyPair()
    writeFileSync(p, pair.privateKey, { mode: 0o600 })
    return pair.publicKey
  }
  getPrivate(keyId: string): string | undefined {
    const p = this.path(keyId)
    return existsSync(p) ? readFileSync(p, "utf8").trim() : undefined
  }
}

export class MemoryKeyStore implements KeyStore {
  private keys = new Map<string, string>()
  create(keyId: string): string {
    if (this.keys.has(keyId)) throw new Error(`Key ${keyId} already exists`)
    const pair = generateKeyPair()
    this.keys.set(keyId, pair.privateKey)
    return pair.publicKey
  }
  getPrivate(keyId: string): string | undefined {
    return this.keys.get(keyId)
  }
}
