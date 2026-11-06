import { ApiError, api, getSession, setSession, type Session } from "./api"

const session: Session = {
  token: "tok123",
  expiresAt: Date.now() + 3_600_000,
  user: { id: "u1", email: "a@b.c", name: "A", role: "admin", manufacturerId: null },
}
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))

afterEach(() => {
  vi.unstubAllGlobals()
  setSession(null)
})

describe("api client", () => {
  it("sends the bearer token and JSON body", async () => {
    setSession(session)
    const fetchMock = vi.fn(() => json(200, { id: "p1" }))
    vi.stubGlobal("fetch", fetchMock)
    await api.createProduct({ name: "Sugar", category: "FOOD", packSize: "1 kg" })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/v1/products")
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok123")
    expect(JSON.parse(init.body as string)).toMatchObject({ name: "Sugar" })
  })

  it("builds query strings and skips empty filters", async () => {
    const fetchMock = vi.fn(() => json(200, []))
    vi.stubGlobal("fetch", fetchMock)
    await api.alerts({ status: "open", priority: undefined, limit: 5 })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/v1/alerts?status=open&limit=5")
  })

  it("turns the server's error shape into an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(400, { error: { code: "VALIDATION_FAILED", message: "Invalid body", details: { fieldErrors: { name: ["Required"] } } } })),
    )
    const err = await api.createManufacturer("x").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 400, code: "VALIDATION_FAILED", details: { fieldErrors: { name: ["Required"] } } })
  })

  it("signs the user out when a token is rejected, but not for a wrong password", async () => {
    setSession(session)
    vi.stubGlobal("fetch", vi.fn(() => json(401, { error: { code: "UNAUTHENTICATED", message: "Sign in" } })))
    await api.overview().catch(() => {})
    expect(getSession()).toBeNull()

    setSession(session)
    await api.login("a@b.c", "wrong").catch(() => {})
    expect(getSession()).not.toBeNull()
  })

  it("reports an unreachable server in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fetch failed"))))
    await expect(api.overview()).rejects.toMatchObject({ status: 0, code: "NETWORK", message: expect.stringContaining("Cannot reach the server") })
  })

  it("copes with a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("<html>bad gateway</html>", { status: 502 }))))
    await expect(api.overview()).rejects.toMatchObject({ status: 502, message: "Request failed (502)" })
  })

  it("stores the session in localStorage and drops it on sign-out", () => {
    setSession(session)
    expect(JSON.parse(localStorage.getItem("scanuganda.session")!).token).toBe("tok123")
    setSession(null)
    expect(localStorage.getItem("scanuganda.session")).toBeNull()
  })
})
