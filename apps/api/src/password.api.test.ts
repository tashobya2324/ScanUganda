import { beforeAll, describe, expect, it } from "vitest"
import { PASSWORD, USERS, makeTestApp } from "./test-helpers.ts"

let t: Awaited<ReturnType<typeof makeTestApp>>
beforeAll(async () => {
  t = await makeTestApp()
})

const change = async (who: string, payload: object) =>
  t.app.inject({ method: "POST", url: "/v1/auth/password", payload, headers: await t.as(who) })
const login = (email: string, password: string) => t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } })

describe("change password", () => {
  it("needs a signed-in user", async () => {
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/password", payload: { currentPassword: PASSWORD, newPassword: "another-long-password" } })
    expect(res.statusCode).toBe(401)
  })

  it("rejects a wrong current password without signing the user out (403, not 401)", async () => {
    const res = await change(USERS.maker, { currentPassword: "not-the-password", newPassword: "another-long-password" })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe("WRONG_PASSWORD")
    expect((await login(USERS.maker, PASSWORD)).statusCode).toBe(200)
  })

  it("rejects a short or unchanged new password", async () => {
    expect((await change(USERS.maker, { currentPassword: PASSWORD, newPassword: "short" })).statusCode).toBe(400)
    const same = await change(USERS.maker, { currentPassword: PASSWORD, newPassword: PASSWORD })
    expect(same.statusCode).toBe(400)
    expect(same.json().error.code).toBe("SAME_PASSWORD")
  })

  it("changes the password: the new one signs in, the old one no longer does", async () => {
    const res = await change(USERS.maker, { currentPassword: PASSWORD, newPassword: "a-brand-new-password" })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    expect((await login(USERS.maker, "a-brand-new-password")).statusCode).toBe(200)
    expect((await login(USERS.maker, PASSWORD)).statusCode).toBe(401)
  })

  it("only changes the caller's own password", async () => {
    expect((await login(USERS.admin, PASSWORD)).statusCode).toBe(200)
  })
})
