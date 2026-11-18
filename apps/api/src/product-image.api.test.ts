import { beforeAll, describe, expect, it } from "vitest"
import { USERS, makeTestApp } from "./test-helpers.ts"

// A 1x1 PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

let t: Awaited<ReturnType<typeof makeTestApp>>
beforeAll(async () => {
  t = await makeTestApp()
})
const as = async (who: string, method: "GET" | "POST" | "PATCH", url: string, payload?: object) =>
  t.app.inject({ method, url, payload, headers: await t.as(who) })

describe("product pictures", () => {
  it("a maker sets a picture, anyone can fetch it, and lists point to it", async () => {
    const products = (await as(USERS.maker, "GET", "/v1/products")).json()
    expect(products[0].imageUrl).toBeNull()
    const id = products[0].id
    const set = await as(USERS.maker, "PATCH", `/v1/products/${id}/image`, { image: PNG })
    expect(set.statusCode).toBe(200)
    expect(set.json().imageUrl.startsWith(`/v1/products/${id}/image?v=`)).toBe(true)

    const img = await t.app.inject({ method: "GET", url: `/v1/products/${id}/image` }) // no sign-in
    expect(img.statusCode).toBe(200)
    expect(img.headers["content-type"]).toBe("image/png")
    expect(img.body).toContain("PNG") // the test helper reads the body as text, so only the readable marker is checked

    expect((await as(USERS.maker, "GET", "/v1/products")).json().find((p: { id: string }) => p.id === id).imageUrl).toBe(set.json().imageUrl)
    expect((await as(USERS.maker, "GET", "/v1/batches")).json().some((b: { imageUrl: string | null }) => b.imageUrl)).toBe(true)
  })

  it("can be removed again", async () => {
    const id = (await as(USERS.maker, "GET", "/v1/products")).json().find((p: { imageUrl: string | null }) => p.imageUrl).id
    expect((await as(USERS.maker, "PATCH", `/v1/products/${id}/image`, { image: null })).json().imageUrl).toBeNull()
    expect((await t.app.inject({ method: "GET", url: `/v1/products/${id}/image` })).statusCode).toBe(404)
  })

  it("refuses non-images, oversized pictures and other makers' products", async () => {
    const id = (await as(USERS.maker, "GET", "/v1/products")).json()[0].id
    expect((await as(USERS.maker, "PATCH", `/v1/products/${id}/image`, { image: "data:text/html;base64,PGI+" })).statusCode).toBe(400)
    expect((await as(USERS.maker, "PATCH", `/v1/products/${id}/image`, { image: "data:image/png;base64," + "A".repeat(150_000) })).statusCode).toBe(400)
    expect((await as(USERS.inspector, "PATCH", `/v1/products/${id}/image`, { image: PNG })).statusCode).toBe(403)
    const all = (await as(USERS.admin, "GET", "/v1/products")).json()
    const other = all.find((p: { manufacturerId: string }) => p.manufacturerId !== all.find((x: { id: string }) => x.id === id).manufacturerId)
    expect((await as(USERS.maker, "PATCH", `/v1/products/${other.id}/image`, { image: PNG })).statusCode).toBe(404)
  })
})
