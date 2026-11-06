import { batchStatus, formatDate, groupCode, percent, timeAgo, unitsToCsv } from "./format"

const NOW = Date.UTC(2026, 10, 6, 12, 0, 0)
const MIN = 60_000
const H = 60 * MIN
const D = 24 * H

describe("timeAgo", () => {
  it.each([
    [10_000, "just now"],
    [5 * MIN, "5 min ago"],
    [90 * MIN, "2 h ago"],
    [3 * D, "3 d ago"],
  ])("%i ms ago → %s", (ago, text) => expect(timeAgo(NOW - ago, NOW)).toBe(text))

  it("falls back to a date after a week and never goes negative", () => {
    expect(timeAgo(NOW - 30 * D, NOW)).toBe(formatDate(NOW - 30 * D))
    expect(timeAgo(NOW + 5 * MIN, NOW)).toBe("just now")
  })
})

describe("percent", () => {
  it("rounds and avoids dividing by zero", () => {
    expect(percent(1, 3)).toBe("33%")
    expect(percent(0, 0)).toBe("n/a")
  })
})

describe("batchStatus", () => {
  it("prefers recalled, then expired, then expiring soon", () => {
    expect(batchStatus({ recall: { at: 1, reason: "x" }, expiresAt: NOW - D }, NOW)).toBe("recalled")
    expect(batchStatus({ recall: null, expiresAt: NOW - 1 }, NOW)).toBe("expired")
    expect(batchStatus({ recall: null, expiresAt: NOW + 10 * D }, NOW)).toBe("expiring")
    expect(batchStatus({ recall: null, expiresAt: NOW + 90 * D }, NOW)).toBe("active")
  })
})

describe("codes", () => {
  it("groups scratch codes in fours", () => expect(groupCode("123456789012")).toBe("1234 5678 9012"))
  it("builds a CSV with a header and one line per unit", () => {
    const csv = unitsToCsv([{ serial: "000001", payload: "B.000001.sig", lookupCode: "111111111111" }])
    expect(csv).toBe("serial,payload,lookup_code\n000001,B.000001.sig,111111111111\n")
  })
})
