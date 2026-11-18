import { useState } from "react"
import { imageSrc } from "../lib/api"

const cx = (...p: (string | false | undefined)[]) => p.filter(Boolean).join(" ")

const TINT: Record<string, { bg: string; fg: string }> = {
  FOOD: { bg: "#e3eee9", fg: "#0f5c47" },
  BEVERAGE: { bg: "#e3ecf7", fg: "#1d4e89" },
  COSMETIC: { bg: "#f6e6ee", fg: "#9d2a62" },
  AGRO_CHEMICAL: { bg: "#f7ecd9", fg: "#9a5b00" },
}

/** A drawn stand-in for a product with no photo, one shape per category. */
function Illustration({ category }: { category: string }) {
  const c = TINT[category] ?? TINT.FOOD!
  return (
    <svg viewBox="0 0 96 96" className="h-full w-full" role="img" aria-label={category.toLowerCase().replace("_", " ")}>
      <rect width="96" height="96" fill={c.bg} />
      {category === "BEVERAGE" && (
        <g fill={c.fg}>
          <rect x="40" y="12" width="16" height="8" rx="2" />
          <path d="M42 20h12v12c0 6 10 10 10 22v28a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V54c0-12 10-16 10-22Z" />
          <rect x="34" y="50" width="28" height="20" fill="#fff" opacity="0.85" />
        </g>
      )}
      {category === "COSMETIC" && (
        <g fill={c.fg}>
          <path d="M44 10h14a3 3 0 0 1 3 3v3H44Z" />
          <rect x="44" y="16" width="6" height="10" />
          <rect x="30" y="26" width="36" height="8" rx="3" />
          <rect x="28" y="34" width="40" height="52" rx="8" />
          <rect x="34" y="48" width="28" height="22" rx="3" fill="#fff" opacity="0.85" />
        </g>
      )}
      {category === "AGRO_CHEMICAL" && (
        <g fill={c.fg}>
          <path d="M30 28h28l8 8v44a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6V34a6 6 0 0 1 6-6Z" />
          <rect x="34" y="16" width="16" height="12" rx="2" />
          <path d="M60 28h10a6 6 0 0 1 6 6v6" fill="none" stroke={c.fg} strokeWidth="5" strokeLinecap="round" />
          <rect x="30" y="48" width="30" height="22" rx="3" fill="#fff" opacity="0.85" />
          <path d="M45 52l9 15H36Z" fill={c.fg} />
        </g>
      )}
      {(category === "FOOD" || !TINT[category]) && (
        <g fill={c.fg}>
          <path d="M24 22l5 -5 5 5 5 -5 5 5 5 -5 5 5 5 -5 5 5 5 -5 4 5v60a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4Z" />
          <circle cx="48" cy="52" r="14" fill="#fff" opacity="0.85" />
          <path d="M42 52l4 4 8-9" fill="none" stroke={c.fg} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  )
}

/** The product's photo, or a drawn stand-in when there is none (or it cannot load). */
export function ProductImage({ url, category, name, className }: { url?: string | null; category: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={cx("inline-block shrink-0 overflow-hidden rounded-control bg-line", className ?? "size-10")}>
      {url && !failed ? <img src={imageSrc(url)} alt={name} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" /> : <Illustration category={category} />}
    </span>
  )
}
