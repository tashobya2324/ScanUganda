import { timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { smsReply, type SmsSender } from "./sms.ts"
import type { Config } from "./config.ts"
import { HttpError, raw, type RequestInfo, type Route } from "./http.ts"
import { SlidingWindow } from "./limiter.ts"
import type { Store } from "./store.ts"
import { runUssd, type UssdDeps } from "./ussd.ts"
import { performScan } from "./verification.ts"

/** Checks an aggregator's callback carries our shared secret (header `x-channel-key` or `?key=`). */
function assertChannelKey(config: Config, req: RequestInfo): void {
  if (!config.channelSecret) return // development: open. Set CHANNEL_SECRET in production.
  const given = req.header("x-channel-key") ?? req.query("key") ?? ""
  const a = Buffer.from(given)
  const b = Buffer.from(config.channelSecret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "UNAUTHENTICATED", "Bad channel key")
}

const AggregatorUssd = z.object({
  sessionId: z.string().max(120).optional(),
  serviceCode: z.string().max(40).optional(),
  phoneNumber: z.string().min(3).max(40),
  networkCode: z.string().max(20).optional(),
  text: z.string().max(500).default(""),
})

const AggregatorSms = z.object({
  from: z.string().min(3).max(40),
  to: z.string().max(40).optional(),
  text: z.string().max(1000),
  id: z.string().max(120).optional(),
})

export function channelRoutes(route: Route, store: Store, config: Config, sms: SmsSender): void {
  // Few checks per phone number per window: a 12-digit code cannot be guessed by repetition.
  const phoneLimit = new SlidingWindow(15, 10 * 60_000)
  const simulatorLimit = new SlidingWindow(300, 10 * 60_000)

  const depsFor = async (channel: "USSD" | "SMS", phone: string, limiter: SlidingWindow): Promise<UssdDeps> => ({
    regions: await store.regions(),
    allow: () => limiter.allow(phone),
    check: (code, region) =>
      performScan(store, config.lookupPepper, {
        code,
        channel,
        scannerRole: "consumer",
        at: Date.now(),
        wasOffline: false,
        // No GPS on a basic phone: the district's centre, blurred by its own radius.
        position: region && { lat: region.center.lat, lng: region.center.lng, accuracyM: Math.round(region.radiusKm * 1000) },
      }),
    report: async (description) => void (await store.insertReport({ description: `[${channel}] ${description}` })),
  })

  /** Any failure becomes a polite END screen: a phone user must never see a raw error. */
  const safely = async (fn: () => Promise<string>, onError: (e: unknown) => void): Promise<string> => {
    try {
      return await fn()
    } catch (e) {
      onError(e)
      return "END Sorry, something went wrong. Please try again."
    }
  }

  route({
    method: "POST", url: "/v1/ussd", tag: "Channels", auth: "public", rateLimit: 600,
    summary: "USSD callback for the aggregator (form-encoded; replies CON/END text)",
    body: AggregatorUssd,
    handler: async ({ body, req }) => {
      assertChannelKey(config, req)
      const wire = await safely(
        async () => (await runUssd(body.text, await depsFor("USSD", body.phoneNumber, phoneLimit))).wire,
        (e) => req.log.error(e),
      )
      return raw({ contentType: "text/plain; charset=utf-8", body: wire })
    },
  })

  route({
    method: "POST", url: "/v1/sms", tag: "Channels", auth: "public", rateLimit: 600,
    summary: "Incoming-SMS callback for the aggregator: checks the code and texts the answer back",
    body: AggregatorSms,
    response: z.object({ ok: z.literal(true), reply: z.string(), delivered: z.boolean() }),
    handler: async ({ body, req }) => {
      assertChannelKey(config, req)
      const reply = (await safely(
        async () => smsReply(body.text, await depsFor("SMS", body.from, phoneLimit)),
        (e) => req.log.error(e),
      )).replace(/^END /, "")
      let delivered = true
      try {
        await sms.send(body.from, reply)
      } catch (e) {
        req.log.error(e)
        delivered = false
      }
      return { ok: true as const, reply, delivered }
    },
  })

  route({
    method: "POST", url: "/v1/ussd/simulate", tag: "Channels", auth: ["admin", "manufacturer", "inspector"],
    summary: "Staff-only: run the same USSD menu the aggregator would, for the console's simulator",
    body: z.object({ text: z.string().max(500).default("") }),
    response: z.object({ type: z.enum(["CON", "END"]), message: z.string(), wire: z.string() }),
    handler: async ({ body, user }) => runUssd(body.text, await depsFor("USSD", `simulator-${user!.id}`, simulatorLimit)),
  })
}
