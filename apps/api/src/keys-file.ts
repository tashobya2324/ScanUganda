import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { generateKeyPair } from "@scanuganda/core"
import { SAFE_KEY_ID, type KeyStore } from "./keys.ts"

/** One file per private key, outside the database and git. Node hosts with a disk only. */
export class FileKeyStore implements KeyStore {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true })
  }
  private path(keyId: string): string {
    if (!SAFE_KEY_ID.test(keyId)) throw new Error("Unsafe key id")
    return join(this.dir, `${keyId}.key`)
  }
  async create(keyId: string): Promise<string> {
    const p = this.path(keyId)
    if (existsSync(p)) throw new Error(`Key ${keyId} already exists`)
    const pair = generateKeyPair()
    writeFileSync(p, pair.privateKey, { mode: 0o600 })
    return pair.publicKey
  }
  async getPrivate(keyId: string): Promise<string | undefined> {
    const p = this.path(keyId)
    return existsSync(p) ? readFileSync(p, "utf8").trim() : undefined
  }
}
