import { useEffect, useState, type ReactNode } from "react"

type Screen = "welcome" | "language" | "privacy" | "auth" | "reset" | "otp" | "home" | "scan" | "manual" | "verifying" | "green" | "yellow" | "red" | "report" | "reportDone" | "history" | "profile" | "settings" | "offline" | "guide"

type IconName = "home" | "scan" | "history" | "report" | "user" | "arrow" | "back" | "check" | "warning" | "close" | "camera" | "location" | "lock" | "eye" | "mail" | "flash" | "image" | "keyboard" | "share" | "search" | "filter" | "chevron" | "bell" | "moon" | "globe" | "database" | "shield" | "help" | "sync" | "download" | "trash" | "logout" | "signal" | "box" | "shop" | "factory" | "truck" | "phone" | "more"

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const p: Record<IconName, ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    scan: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <path d="M7 12h10M9 9v6M15 9v6" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    report: (
      <>
        <path d="M12 3 2.8 19a1.3 1.3 0 0 0 1.1 2h16.2a1.3 1.3 0 0 0 1.1-2L12 3Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
    back: <path d="m15 18-6-6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    warning: (
      <>
        <path d="M12 3 2.8 19a1.3 1.3 0 0 0 1.1 2h16.2a1.3 1.3 0 0 0 1.1-2L12 3Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    camera: (
      <>
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <path d="m8 6 1.5-3h5L16 6" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    location: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    flash: <path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z" />,
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    keyboard: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h.01M11 14h6" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="m8 11 8-5M8 13l8 5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    moon: <path d="M21 15.4A9 9 0 0 1 8.6 3 9 9 0 1 0 21 15.4Z" />,
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 4.6 2.8 8.5 7 10 4.2-1.5 7-5.4 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.7 2.7 0 1 1 3.3 2.6c-.8.3-.8.9-.8 1.4M12 17h.01" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7h-5V2M4 17h5v5" />
        <path d="M5.8 9A7 7 0 0 1 18 5l2 2M18.2 15A7 7 0 0 1 6 19l-2-2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" />
      </>
    ),
    logout: (
      <>
        <path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" />
      </>
    ),
    signal: (
      <>
        <path d="M5 19v-2M9.5 19v-5M14.5 19v-8M19 19V7" />
      </>
    ),
    box: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4ZM4 7v10l8 4 8-4V7M12 11v10" />
      </>
    ),
    shop: (
      <>
        <path d="M4 10v10h16V10M3 10l2-6h14l2 6" />
        <path d="M8 20v-6h8v6M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2" />
      </>
    ),
    factory: (
      <>
        <path d="M3 21V9l6 3V9l6 3V4h6v17H3Z" />
        <path d="M7 17h.01M11 17h.01M15 17h.01" />
      </>
    ),
    truck: (
      <>
        <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
    phone: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M10 18h4" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {p[name]}
    </svg>
  )
}

const recent = [
  {
    product: "Kakira Premium Sugar",
    brand: "Kakira Sugar",
    time: "Today, 10:42",
    state: "green",
  },
  {
    product: "Movit Herbal Jelly",
    brand: "Movit Products",
    time: "Yesterday, 17:08",
    state: "yellow",
  },
  {
    product: "Nile Special Lager",
    brand: "Nile Breweries",
    time: "Mon, 14:21",
    state: "green",
  },
  {
    product: "Rocket Battery AA",
    brand: "Uganda Batteries",
    time: "Sun, 09:16",
    state: "red",
  },
]

function Button({
  children,
  onClick,
  tone = "primary",
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  tone?: "primary" | "secondary" | "danger" | "ghost"
  disabled?: boolean
}) {
  return (
    <button className={`button ${tone}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

function TopBar({
  title,
  back,
  action,
}: {
  title: string
  back?: () => void
  action?: ReactNode
}) {
  return (
    <header className="app-topbar">
      {back ? (
        <button className="icon-button" onClick={back} aria-label="Go back">
          <Icon name="back" />
        </button>
      ) : (
        <div className="mini-brand">
          <span>S</span>
        </div>
      )}
      <strong>{title}</strong>
      <div className="top-action">{action}</div>
    </header>
  )
}

function BottomNav({
  current,
  go,
}: {
  current: string
  go: (screen: Screen) => void
}) {
  const items: { label: string; icon: IconName; screen: Screen }[] = [
    { label: "Home", icon: "home", screen: "home" },
    { label: "History", icon: "history", screen: "history" },
    { label: "Scan", icon: "scan", screen: "scan" },
    { label: "Report", icon: "report", screen: "report" },
    { label: "Profile", icon: "user", screen: "profile" },
  ]
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.label}
          className={`${current === item.screen ? "active" : ""} ${
            item.screen === "scan" ? "scan-nav" : ""
          }`}
          onClick={() => go(item.screen)}
        >
          <span>
            <Icon name={item.icon} size={item.screen === "scan" ? 25 : 21} />
          </span>
          <small>{item.label}</small>
        </button>
      ))}
    </nav>
  )
}

function Welcome({ go }: { go: (s: Screen) => void }) {
  const [slide, setSlide] = useState(0)
  const slides = [
    {
      icon: "scan" as IconName,
      n: "01",
      title: "Scan the code",
      copy: "Point your camera at the QR code on any product.",
      art: "scan-art",
    },
    {
      icon: "shield" as IconName,
      n: "02",
      title: "Get a clear answer",
      copy: "Green is genuine. Yellow needs care. Red means stop.",
      art: "verdict-art",
    },
    {
      icon: "report" as IconName,
      n: "03",
      title: "Help stop fakes",
      copy: "Report suspicious products and protect your community.",
      art: "report-art",
    },
  ]
  const item = slides[slide]
  return (
    <div className="onboarding screen">
      <header>
        <div className="wordmark">
          <i>S</i>
          <strong>ScanUganda</strong>
        </div>
        <button onClick={() => go("language")}>Skip</button>
      </header>
      <div className={`welcome-art ${item.art}`}>
        <span className="art-number">{item.n}</span>
        <div className="art-icon">
          <Icon name={item.icon} size={68} />
        </div>
        {slide === 1 && (
          <div className="mini-verdicts">
            <span>G</span>
            <span>Y</span>
            <span>R</span>
          </div>
        )}
        {slide === 2 && (
          <div className="report-lines">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      <div className="welcome-copy">
        <span className="eyebrow">Know before you buy</span>
        <h1>{item.title}</h1>
        <p>{item.copy}</p>
      </div>
      <div className="welcome-bottom">
        <div className="dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={i === slide ? "active" : ""}
              onClick={() => setSlide(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <button
          className="round-next"
          onClick={() => (slide < 2 ? setSlide(slide + 1) : go("language"))}
          aria-label="Next"
        >
          <Icon name="arrow" />
        </button>
      </div>
    </div>
  )
}

function Language({ go }: { go: (s: Screen) => void }) {
  const [lang, setLang] = useState("English")
  return (
    <div className="simple-screen screen">
      <TopBar title="" back={() => go("welcome")} />
      <div className="screen-content">
        <span className="step-label">SETUP · 1 OF 2</span>
        <h1>Choose your language</h1>
        <p className="lead">You can change this later in settings.</p>
        <div className="language-list">
          {[
            ["English", "English"],
            ["Luganda", "Oluganda"],
            ["Swahili", "Kiswahili"],
            ["Runyankole", "Orunyankore"],
          ].map(([name, native]) => (
            <button
              key={name}
              className={lang === name ? "selected" : ""}
              onClick={() => setLang(name)}
            >
              <span>
                <strong>{name}</strong>
                <small>{native}</small>
              </span>
              <i>{lang === name && <Icon name="check" size={17} />}</i>
            </button>
          ))}
        </div>
      </div>
      <div className="sticky-action">
        <Button onClick={() => go("privacy")}>
          Continue <Icon name="arrow" />
        </Button>
      </div>
    </div>
  )
}

function Privacy({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="simple-screen screen">
      <TopBar title="" back={() => go("language")} />
      <div className="screen-content privacy-content">
        <span className="step-label">SETUP · 2 OF 2</span>
        <h1>Your privacy matters</h1>
        <p className="lead">
          We only ask for what ScanUganda needs to protect you.
        </p>
        <div className="permission-card">
          <span>
            <Icon name="camera" />
          </span>
          <div>
            <strong>Camera</strong>
            <p>To read product codes. We never record video.</p>
          </div>
        </div>
        <div className="permission-card">
          <span>
            <Icon name="location" />
          </span>
          <div>
            <strong>Location</strong>
            <p>
              To spot copied codes in the wrong place. Your location is
              anonymised.
            </p>
          </div>
        </div>
        <div className="privacy-lock">
          <Icon name="lock" size={18} />
          <p>
            Your data is encrypted and protected under Uganda’s Data Protection
            and Privacy Act.
          </p>
        </div>
      </div>
      <div className="sticky-action double">
        <Button onClick={() => go("auth")}>Allow and continue</Button>
        <button className="text-button" onClick={() => go("home")}>
          Not now
        </button>
      </div>
    </div>
  )
}

function Auth({ go }: { go: (s: Screen) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin")
  return (
    <div className="simple-screen screen auth-screen">
      <TopBar title="" back={() => go("privacy")} />
      <div className="screen-content">
        <div className="auth-mark">SU</div>
        <h1>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p className="lead">
          {mode === "signin"
            ? "Sign in to see your scan history on any phone."
            : "Save your scans and reports securely."}
        </p>
        <div className="segmented">
          <button
            className={mode === "signin" ? "active" : ""}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>
        {mode === "register" && (
          <label className="field">
            <span>Full name</span>
            <div>
              <Icon name="user" size={19} />
              <input placeholder="e.g. Sarah Namukasa" />
            </div>
          </label>
        )}
        <label className="field">
          <span>Phone or email</span>
          <div>
            <Icon name="mail" size={19} />
            <input placeholder="+256 7XX XXX XXX" />
          </div>
        </label>
        <label className="field">
          <span>Password</span>
          <div>
            <Icon name="lock" size={19} />
            <input type="password" placeholder="At least 8 characters" />
            <Icon name="eye" size={18} />
          </div>
        </label>
        {mode === "signin" && (
          <button className="forgot" onClick={() => go("reset")}>
            Forgot password?
          </button>
        )}
        <Button onClick={() => go("otp")}>
          {mode === "signin" ? "Sign in" : "Create account"}{" "}
          <Icon name="arrow" />
        </Button>
        <div className="or">
          <span>or</span>
        </div>
        <Button tone="secondary" onClick={() => go("home")}>
          Continue without an account
        </Button>
      </div>
    </div>
  )
}

function Reset({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="simple-screen screen">
      <TopBar title="Reset password" back={() => go("auth")} />
      <div className="screen-content reset-content">
        <div className="large-soft-icon">
          <Icon name="lock" size={32} />
        </div>
        <h1>Get back into your account</h1>
        <p className="lead">
          Enter your phone number. We’ll send you a code to reset your password.
        </p>
        <label className="field">
          <span>Phone number</span>
          <div>
            <strong>+256</strong>
            <input placeholder="7XX XXX XXX" />
          </div>
        </label>
        <Button onClick={() => go("otp")}>Send reset code</Button>
      </div>
    </div>
  )
}

function Otp({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="simple-screen screen">
      <TopBar title="Two-step verification" back={() => go("auth")} />
      <div className="screen-content otp-content">
        <div className="large-soft-icon">
          <Icon name="shield" size={32} />
        </div>
        <h1>Check your messages</h1>
        <p className="lead">
          Enter the 6-digit code sent to <strong>+256 701 ••• 482</strong>
        </p>
        <div className="otp-boxes">
          {["4", "8", "2", "", "", ""].map((v, i) => (
            <input key={i} value={v} readOnly aria-label={`Digit ${i + 1}`} />
          ))}
        </div>
        <p className="resend">
          Didn’t receive it? <button>Send again in 00:24</button>
        </p>
        <Button onClick={() => go("home")}>Verify and continue</Button>
      </div>
    </div>
  )
}

function Home({ go, offline }: { go: (s: Screen) => void; offline: boolean }) {
  return (
    <div className="app-screen screen with-nav">
      <header className="home-header">
        <div>
          <span>Good morning,</span>
          <h1>Sarah</h1>
        </div>
        <button className="avatar-button" onClick={() => go("profile")}>
          SN
          <i />
        </button>
      </header>
      <div className="scroll-content">
        {offline && (
          <button className="offline-banner" onClick={() => go("offline")}>
            <Icon name="signal" size={18} />
            <span>
              <strong>You’re offline</strong>
              <small>Scans will be saved and checked later.</small>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        )}
        <button className="recall-banner" onClick={() => go("red")}>
          <span className="alert-shape">
            <Icon name="warning" size={18} />
          </span>
          <span>
            <strong>Recall alert near you</strong>
            <small>1 product batch in Kampala</small>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <div className="week-head">
          <div>
            <span className="eyebrow">THIS WEEK</span>
            <strong>4 products checked</strong>
          </div>
          <span className="streak">
            <Icon name="shield" size={14} /> 3 day streak
          </span>
        </div>
        <div className="week-strip">
          {[
            ["M", 1],
            ["T", 1],
            ["W", 1],
            ["T", 1],
            ["F", 0],
            ["S", 0],
            ["S", 0],
          ].map(([d, done], i) => (
            <div key={i}>
              <span className={done ? "done" : ""}>
                {done ? <Icon name="check" size={14} /> : i + 10}
              </span>
              <small>{d}</small>
            </div>
          ))}
        </div>
        <section className="trust-card">
          <div className="trust-copy">
            <span className="eyebrow">YOUR SAFE SHOPPING SCORE</span>
            <h2>Looking good</h2>
            <p>Most products you checked this month were genuine.</p>
            <span className="trend">↑ 8% from last month</span>
          </div>
          <div className="score-ring">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" />
              <circle className="progress" cx="50" cy="50" r="40" />
            </svg>
            <strong>86</strong>
            <small>/100</small>
          </div>
        </section>
        <button className="hero-scan" onClick={() => go("scan")}>
          <span>
            <Icon name="scan" size={32} />
          </span>
          <div>
            <strong>Scan a product</strong>
            <small>Get an answer in seconds</small>
          </div>
          <Icon name="arrow" />
        </button>
        <section className="recent-block">
          <div className="section-title">
            <h2>Recent scans</h2>
            <button onClick={() => go("history")}>See all</button>
          </div>
          {recent.slice(0, 3).map((item) => (
            <ScanRow
              key={item.product}
              {...item}
              onClick={() => go(item.state as Screen)}
            />
          ))}
        </section>
      </div>
      <BottomNav current="home" go={go} />
    </div>
  )
}

function ScanRow({
  product,
  brand,
  time,
  state,
  onClick,
}: {
  product: string
  brand: string
  time: string
  state: string
  onClick: () => void
}) {
  return (
    <button className="scan-row" onClick={onClick}>
      <span className={`product-thumb ${state}`}>
        <Icon name={state === "green" ? "check" : "warning"} size={19} />
      </span>
      <span className="scan-info">
        <strong>{product}</strong>
        <small>
          {brand} · {time}
        </small>
      </span>
      <span className={`verdict-tag ${state}`}>
        {state === "green" ? "GENUINE" : state === "yellow" ? "CHECK" : "STOP"}
      </span>
      <Icon name="chevron" size={17} />
    </button>
  )
}

function Scanner({ go }: { go: (s: Screen) => void }) {
  const [flash, setFlash] = useState(false)
  const [hint, setHint] = useState("Hold steady over the product code")
  return (
    <div className={`scanner-screen screen ${flash ? "flash-on" : ""}`}>
      <header>
        <button className="camera-control" onClick={() => go("home")}>
          <Icon name="close" />
        </button>
        <strong>Scan product</strong>
        <button
          className={`camera-control ${flash ? "active" : ""}`}
          onClick={() => setFlash(!flash)}
        >
          <Icon name="flash" />
        </button>
      </header>
      <div className="camera-surface" onClick={() => go("verifying")}>
        <div className="camera-noise" />
        <div className="scan-frame">
          <i />
          <i />
          <i />
          <i />
          <div className="moving-line" />
        </div>
        <div className="scan-hint">
          <span>
            <Icon name="scan" size={19} />
          </span>
          <strong>{hint}</strong>
          <small>Tap the frame to simulate a scan</small>
        </div>
      </div>
      <div className="scanner-tools">
        <button onClick={() => setHint("Poor light — turn on the flashlight")}>
          <span>
            <Icon name="image" />
          </span>
          <small>Gallery</small>
        </button>
        <button className="manual-code" onClick={() => go("manual")}>
          <Icon name="keyboard" />
          <strong>Type the code instead</strong>
        </button>
        <button onClick={() => setHint("Move closer — code is not readable")}>
          <span>
            <Icon name="help" />
          </span>
          <small>Help</small>
        </button>
      </div>
    </div>
  )
}

function Manual({ go }: { go: (s: Screen) => void }) {
  const [code, setCode] = useState("")
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "ABC", "0", "⌫"]
  return (
    <div className="simple-screen screen manual-screen">
      <TopBar title="Enter product code" back={() => go("scan")} />
      <div className="screen-content">
        <div className="scratch-visual">
          <div className="scratch">
            <span>SCRATCH HERE</span>
            <b>•••• •••• ••••</b>
          </div>
        </div>
        <h1>Type the code</h1>
        <p className="lead">
          Find the 12-digit code under the silver scratch layer.
        </p>
        <div className="code-display">
          {code || <span>0000 0000 0000</span>}
        </div>
        <small className="format-hint">
          <Icon name="shield" size={14} /> We’ll check the number before sending
          it.
        </small>
      </div>
      <div className="number-pad">
        {keys.map((key) => (
          <button
            key={key}
            onClick={() =>
              key === "⌫"
                ? setCode(code.slice(0, -1))
                : key !== "ABC" && code.length < 12
                  ? setCode(code + key)
                  : null
            }
          >
            {key}
          </button>
        ))}
      </div>
      <div className="manual-action">
        <Button disabled={code.length < 8} onClick={() => go("verifying")}>
          Check this code
        </Button>
      </div>
    </div>
  )
}

function Verifying({ go }: { go: (s: Screen) => void }) {
  useEffect(() => {
    const t = setTimeout(() => go("green"), 1800)
    return () => clearTimeout(t)
  }, [go])
  return (
    <div className="verifying-screen screen">
      <div className="verify-orbit">
        <span>
          <Icon name="scan" size={40} />
        </span>
        <i />
        <i />
        <i />
      </div>
      <h1>Checking product…</h1>
      <p>Matching the code, location and product journey.</p>
      <div className="verify-steps">
        <span className="done">
          <Icon name="check" size={16} /> Code found
        </span>
        <span className="active">
          <i /> Checking registry
        </span>
        <span>
          <i /> Confirming location
        </span>
      </div>
      <small>This usually takes less than 2 seconds</small>
    </div>
  )
}

const verdictData = {
  green: {
    word: "GENUINE",
    title: "Safe to buy",
    reason: "This product matches the official registry.",
    icon: "check" as IconName,
    shape: "circle",
  },
  yellow: {
    word: "CHECK",
    title: "Wait before buying",
    reason: "This code was checked offline and is not yet confirmed.",
    icon: "warning" as IconName,
    shape: "diamond",
  },
  red: {
    word: "STOP",
    title: "Do not buy or use",
    reason: "This batch was recalled by the manufacturer.",
    icon: "close" as IconName,
    shape: "octagon",
  },
}

function Result({
  state,
  go,
}: {
  state: "green" | "yellow" | "red"
  go: (s: Screen) => void
}) {
  const d = verdictData[state]
  return (
    <div className={`result-screen screen ${state}`}>
      <header>
        <button className="result-back" onClick={() => go("home")}>
          <Icon name="close" />
        </button>
        <span>SCAN RESULT</span>
        <button className="result-back" onClick={() => {}}>
          <Icon name="more" />
        </button>
      </header>
      <div className="verdict-hero">
        <div className={`verdict-symbol ${d.shape}`}>
          <Icon name={d.icon} size={42} />
        </div>
        <span className="verdict-word">{d.word}</span>
        <h1>{d.title}</h1>
        <p>{d.reason}</p>
      </div>
      <div className="result-sheet">
        <div className="product-title">
          <div className="product-pack">K</div>
          <div>
            <span>KAKIRA SUGAR</span>
            <h2>Premium White Sugar</h2>
            <p>1 kg packet · Batch KS-2408-17</p>
          </div>
        </div>
        {state !== "green" && (
          <div className={`reason-box ${state}`}>
            <Icon name="warning" />
            <div>
              <strong>
                {state === "yellow"
                  ? "Why this needs checking"
                  : "Why we stopped you"}
              </strong>
              <p>
                {state === "yellow"
                  ? "The scan is saved. We’ll notify you when the server confirms it."
                  : "UNBS recall issued 18 Feb 2025 due to a packaging fault."}
              </p>
            </div>
          </div>
        )}
        {state === "green" && (
          <>
            <div className="fact-grid">
              <div>
                <small>Made</small>
                <strong>08 Aug 2024</strong>
              </div>
              <div>
                <small>Expires</small>
                <strong>08 Aug 2026</strong>
              </div>
              <div>
                <small>Last checked</small>
                <strong>Today, 10:42</strong>
              </div>
              <div>
                <small>Place</small>
                <strong>Kikuubo, Kampala</strong>
              </div>
            </div>
            <div className="journey">
              <div className="section-title">
                <h3>Product journey</h3>
                <span>ON TRACK</span>
              </div>
              <div className="journey-line">
                <div className="done">
                  <span>
                    <Icon name="factory" size={17} />
                  </span>
                  <small>Factory</small>
                </div>
                <i />
                <div className="done">
                  <span>
                    <Icon name="truck" size={17} />
                  </span>
                  <small>Distributor</small>
                </div>
                <i />
                <div className="current">
                  <span>
                    <Icon name="shop" size={17} />
                  </span>
                  <small>Retailer</small>
                </div>
              </div>
            </div>
          </>
        )}
        {state === "red" && (
          <div className="action-instruction">
            <strong>What to do now</strong>
            <p>
              Do not buy, open or use this product. Move away from the seller
              before reporting if you feel unsafe.
            </p>
          </div>
        )}
        {state === "yellow" && (
          <div className="action-instruction">
            <strong>What to do now</strong>
            <p>
              Keep the product sealed. Scan again when you have a network
              connection.
            </p>
          </div>
        )}
        <div className="reference-row">
          <span>USSD reference</span>
          <strong>SU-84A19</strong>
          <button>
            <Icon name="share" size={17} /> Share
          </button>
        </div>
        <div className="result-actions">
          {state === "red" ? (
            <Button tone="danger" onClick={() => go("report")}>
              <Icon name="report" /> Report this product
            </Button>
          ) : (
            <Button onClick={() => go("scan")}>
              <Icon name="scan" /> Scan another product
            </Button>
          )}
          <Button tone="secondary" onClick={() => go("report")}>
            <Icon name="report" />{" "}
            {state === "red" ? "View safety advice" : "Report a problem"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReportFlow({
  go,
  offline,
}: {
  go: (s: Screen) => void
  offline: boolean
}) {
  const [step, setStep] = useState(1)
  const [issue, setIssue] = useState("Suspected fake")
  const [anonymous, setAnonymous] = useState(true)
  return (
    <div className="simple-screen screen report-flow">
      <TopBar
        title="Report a product"
        back={() => (step > 1 ? setStep(step - 1) : go("home"))}
        action={<span className="step-count">{step}/4</span>}
      />
      <div className="report-progress">
        <i className={step >= 1 ? "done" : ""} />
        <i className={step >= 2 ? "done" : ""} />
        <i className={step >= 3 ? "done" : ""} />
        <i className={step >= 4 ? "done" : ""} />
      </div>
      <div className="screen-content">
        {step === 1 && (
          <>
            <span className="eyebrow">CHOOSE ONE</span>
            <h1>What’s wrong?</h1>
            <p className="lead">
              Choose the closest match. You can add more details later.
            </p>
            <div className="issue-grid">
              {[
                ["Suspected fake", "warning"],
                ["Expired product", "history"],
                ["Recalled batch", "report"],
                ["Damaged seal", "box"],
              ].map(([label, icon]) => (
                <button
                  key={label}
                  className={issue === label ? "selected" : ""}
                  onClick={() => setIssue(label)}
                >
                  <span>
                    <Icon name={icon as IconName} />
                  </span>
                  <strong>{label}</strong>
                  <i>{issue === label && <Icon name="check" size={15} />}</i>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <span className="eyebrow">ADD EVIDENCE</span>
            <h1>Take clear photos</h1>
            <p className="lead">
              Photos help inspectors identify the product and seller.
            </p>
            <div className="photo-grid">
              <button className="photo-added">
                <div className="pack-photo">
                  KAKIRA
                  <br />
                  SUGAR
                </div>
                <small>Product front</small>
                <span>
                  <Icon name="check" size={14} />
                </span>
              </button>
              <button>
                <span>
                  <Icon name="camera" />
                </span>
                <strong>Add code photo</strong>
                <small>Show the QR or scratch code</small>
              </button>
              <button>
                <span>
                  <Icon name="camera" />
                </span>
                <strong>Add shop photo</strong>
                <small>Only if safe to do so</small>
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <span className="eyebrow">LOCATION & NOTES</span>
            <h1>Where did you find it?</h1>
            <div className="map-card">
              <div className="map-pin">
                <Icon name="location" />
              </div>
              <div>
                <strong>Kikuubo Lane, Kampala</strong>
                <small>Accuracy within 24 metres</small>
              </div>
              <button>Change</button>
            </div>
            <label className="notes-field">
              <span>
                Notes <small>Optional</small>
              </span>
              <textarea placeholder="What did you notice about the product or shop?" />
            </label>
            <button
              className="anonymous-toggle"
              onClick={() => setAnonymous(!anonymous)}
            >
              <span>
                <strong>Report anonymously</strong>
                <small>Your name will not be shared</small>
              </span>
              <i className={anonymous ? "on" : ""}>
                <b />
              </i>
            </button>
          </>
        )}
        {step === 4 && (
          <>
            <span className="eyebrow">FINAL CHECK</span>
            <h1>Review your report</h1>
            <div className="review-card">
              <div>
                <span>Problem</span>
                <strong>{issue}</strong>
              </div>
              <div>
                <span>Product</span>
                <strong>Kakira Premium White Sugar</strong>
              </div>
              <div>
                <span>Location</span>
                <strong>Kikuubo, Kampala</strong>
              </div>
              <div>
                <span>Photos</span>
                <strong>1 attached</strong>
              </div>
              <div>
                <span>Identity</span>
                <strong>{anonymous ? "Anonymous" : "Sarah Namukasa"}</strong>
              </div>
            </div>
            <div className="safe-note">
              <Icon name="shield" />
              <p>
                Your safety comes first. Never confront a seller or put yourself
                in danger.
              </p>
            </div>
          </>
        )}
      </div>
      <div className="sticky-action">
        <Button
          onClick={() => (step < 4 ? setStep(step + 1) : go("reportDone"))}
        >
          {step === 4
            ? offline
              ? "Save report offline"
              : "Send report"
            : "Continue"}{" "}
          <Icon name="arrow" />
        </Button>
      </div>
    </div>
  )
}

function ReportDone({
  go,
  offline,
}: {
  go: (s: Screen) => void
  offline: boolean
}) {
  return (
    <div className="confirmation-screen screen">
      <div className={`confirm-symbol ${offline ? "offline" : ""}`}>
        <Icon name={offline ? "download" : "check"} size={42} />
      </div>
      <span className="eyebrow">
        {offline ? "SAVED ON THIS PHONE" : "REPORT SENT"}
      </span>
      <h1>{offline ? "We’ll send it later" : "Thank you for speaking up"}</h1>
      <p>
        {offline
          ? "Your report is safe. It will send automatically when your signal returns."
          : "An authorised inspector will review your report. We may contact you if you chose to share your name."}
      </p>
      <div className="report-number">
        <small>REPORT NUMBER</small>
        <strong>RPT-UG-02841</strong>
      </div>
      <div className="confirm-steps">
        <div className="done">
          <i>
            <Icon name="check" size={15} />
          </i>
          <span>
            <strong>Report received</strong>
            <small>Today, 10:56</small>
          </span>
        </div>
        <div>
          <i>2</i>
          <span>
            <strong>Inspector review</strong>
            <small>Usually within 2 working days</small>
          </span>
        </div>
        <div>
          <i>3</i>
          <span>
            <strong>Action if confirmed</strong>
            <small>You’ll get an update</small>
          </span>
        </div>
      </div>
      <Button onClick={() => go("home")}>Back to home</Button>
    </div>
  )
}

function History({ go }: { go: (s: Screen) => void }) {
  const [filter, setFilter] = useState("All")
  const filtered =
    filter === "All"
      ? recent
      : recent.filter((x) => x.state === filter.toLowerCase())
  return (
    <div className="app-screen screen with-nav">
      <TopBar
        title="Scan history"
        action={
          <button className="icon-button">
            <Icon name="more" />
          </button>
        }
      />
      <div className="history-tools">
        <label>
          <Icon name="search" size={19} />
          <input placeholder="Search product or brand" />
        </label>
        <button>
          <Icon name="filter" size={19} />
        </button>
      </div>
      <div className="filter-scroll">
        {["All", "Green", "Yellow", "Red", "Offline pending"].map((x) => (
          <button
            key={x}
            className={filter === x ? "active" : ""}
            onClick={() => setFilter(x)}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="history-content">
        {filtered.length ? (
          <>
            <span className="date-group">THIS WEEK</span>
            {filtered.map((item) => (
              <ScanRow
                key={item.product}
                {...item}
                onClick={() => go(item.state as Screen)}
              />
            ))}
            <span className="date-group">EARLIER</span>
            <ScanRow
              product="Mukwano Cooking Oil"
              brand="Mukwano Industries"
              time="24 Feb, 12:02"
              state="green"
              onClick={() => go("green")}
            />
          </>
        ) : (
          <div className="empty-state">
            <div>
              <Icon name="history" size={35} />
            </div>
            <h2>No scans here</h2>
            <p>
              Products with this result will appear here after you scan them.
            </p>
            <Button onClick={() => go("scan")}>Scan a product</Button>
          </div>
        )}
      </div>
      <BottomNav current="history" go={go} />
    </div>
  )
}

function Profile({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="app-screen screen with-nav profile-screen">
      <TopBar
        title="Profile"
        action={
          <button className="icon-button" onClick={() => go("settings")}>
            <Icon name="more" />
          </button>
        }
      />
      <div className="profile-head">
        <div className="profile-avatar">
          SN
          <span />
        </div>
        <h1>Sarah Namukasa</h1>
        <p>Retailer · Kampala, Uganda</p>
        <button>Edit profile</button>
      </div>
      <div className="profile-stats">
        <div>
          <strong>38</strong>
          <small>Scans</small>
        </div>
        <div>
          <strong>6</strong>
          <small>Reports</small>
        </div>
        <div>
          <strong>12</strong>
          <small>Day streak</small>
        </div>
      </div>
      <div className="profile-menu">
        <MenuRow
          icon="settings"
          fallback="moon"
          label="Settings"
          detail="Language, theme, notifications"
          onClick={() => go("settings")}
        />
        <MenuRow
          icon="database"
          label="Offline data"
          detail="3 batches cached · 6 scans queued"
          onClick={() => go("offline")}
        />
        <MenuRow
          icon="shield"
          label="Inspector tools"
          detail="Batch manager and manual sync"
          onClick={() => go("offline")}
        />
        <MenuRow
          icon="help"
          label="How to read results"
          detail="Green, yellow and red explained"
          onClick={() => go("guide")}
        />
      </div>
      <BottomNav current="profile" go={go} />
    </div>
  )
}

function MenuRow({
  icon,
  fallback,
  label,
  detail,
  onClick,
}: {
  icon: string
  fallback?: IconName
  label: string
  detail: string
  onClick: () => void
}) {
  const valid = ["database", "shield", "help", "moon"].includes(icon)
    ? icon as IconName
    : fallback || "help"
  return (
    <button className="menu-row" onClick={onClick}>
      <span>
        <Icon name={valid} />
      </span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <Icon name="chevron" size={18} />
    </button>
  )
}

function Settings({
  go,
  dark,
  setDark,
  offline,
  setOffline,
}: {
  go: (s: Screen) => void
  dark: boolean
  setDark: (v: boolean) => void
  offline: boolean
  setOffline: (v: boolean) => void
}) {
  return (
    <div className="simple-screen screen settings-screen">
      <TopBar title="Settings" back={() => go("profile")} />
      <div className="settings-content">
        <span className="settings-label">PREFERENCES</span>
        <SettingRow icon="globe" label="Language" value="English" />
        <button className="setting-row" onClick={() => setDark(!dark)}>
          <span>
            <Icon name="moon" />
          </span>
          <div>
            <strong>Dark mode</strong>
            <small>Reduce glare in low light</small>
          </div>
          <i className={`toggle ${dark ? "on" : ""}`}>
            <b />
          </i>
        </button>
        <SettingRow icon="bell" label="Notifications" value="On" />
        <button className="setting-row" onClick={() => setOffline(!offline)}>
          <span>
            <Icon name="signal" />
          </span>
          <div>
            <strong>Simulate offline mode</strong>
            <small>Preview saved scans and reports</small>
          </div>
          <i className={`toggle ${offline ? "on" : ""}`}>
            <b />
          </i>
        </button>
        <span className="settings-label">DATA & PRIVACY</span>
        <SettingRow
          icon="database"
          label="Offline data & storage"
          value="24 MB"
          onClick={() => go("offline")}
        />
        <SettingRow icon="location" label="Location consent" value="Allowed" />
        <SettingRow icon="shield" label="Privacy & security" value="" />
        <SettingRow icon="trash" label="Delete my data" value="" danger />
        <span className="settings-label">ACCOUNT</span>
        <SettingRow icon="logout" label="Log out" value="" danger />
      </div>
    </div>
  )
}

function SettingRow({
  icon,
  label,
  value,
  onClick,
  danger,
}: {
  icon: IconName
  label: string
  value: string
  onClick?: () => void
  danger?: boolean
}) {
  return (
    <button
      className={`setting-row ${danger ? "danger" : ""}`}
      onClick={onClick}
    >
      <span>
        <Icon name={icon} />
      </span>
      <div>
        <strong>{label}</strong>
      </div>
      {value && <small>{value}</small>}
      <Icon name="chevron" size={17} />
    </button>
  )
}

function OfflineManager({
  go,
  offline,
}: {
  go: (s: Screen) => void
  offline: boolean
}) {
  return (
    <div className="simple-screen screen offline-screen">
      <TopBar
        title="Offline data"
        back={() => go("profile")}
        action={
          <button className="icon-button">
            <Icon name="more" />
          </button>
        }
      />
      <div className="screen-content">
        <div className={`sync-status ${offline ? "offline" : ""}`}>
          <span>
            <Icon name={offline ? "signal" : "sync"} size={27} />
          </span>
          <div>
            <strong>
              {offline ? "Waiting for a connection" : "All data is up to date"}
            </strong>
            <small>
              {offline
                ? "6 scans and 1 report waiting"
                : "Last synced today at 10:58"}
            </small>
          </div>
        </div>
        <Button onClick={() => {}} disabled={offline}>
          <Icon name="sync" /> Sync now
        </Button>
        <div className="storage-bar">
          <div>
            <span>Offline storage</span>
            <strong>24 MB of 100 MB</strong>
          </div>
          <i>
            <b />
          </i>
          <small>Cached batch data helps verify products without signal.</small>
        </div>
        <div className="section-title">
          <h2>Downloaded batches</h2>
          <button>
            <Icon name="download" size={16} /> Add
          </button>
        </div>
        <div className="batch-list">
          {[
            ["Kakira Sugar", "12 batches", "Expires in 5 days"],
            ["Mukwano Industries", "8 batches", "Expires in 2 days"],
            ["Nile Breweries", "24 batches", "Expires in 6 days"],
          ].map(([name, count, expiry], i) => (
            <div className="batch-row" key={name}>
              <span className="batch-logo">{name[0]}</span>
              <div>
                <strong>{name}</strong>
                <small>
                  {count} · {expiry}
                </small>
              </div>
              <i className={i === 1 ? "expiring" : ""}>
                <Icon name="check" size={14} />
              </i>
            </div>
          ))}
        </div>
        <div className="queue-card">
          <div>
            <span>
              <Icon name="sync" />
            </span>
            <div>
              <strong>Upload queue</strong>
              <small>6 scans · 1 report</small>
            </div>
            <b>{offline ? "WAITING" : "READY"}</b>
          </div>
          <button>
            View queued items <Icon name="chevron" size={17} />
          </button>
        </div>
        <div className="low-storage">
          <Icon name="warning" />
          <div>
            <strong>Low storage protection</strong>
            <p>
              Old batch data is removed automatically when your phone is nearly
              full.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Guide({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="simple-screen screen guide-screen">
      <TopBar title="How to read results" back={() => go("profile")} />
      <div className="screen-content">
        <h1>
          Three answers.
          <br />
          No guesswork.
        </h1>
        <p className="lead">
          Always look for the word and shape, not only the colour.
        </p>
        {(["green", "yellow", "red"] as const).map((state) => {
          const d = verdictData[state]
          return (
            <button
              className={`guide-card ${state}`}
              key={state}
              onClick={() => go(state)}
            >
              <span className={`guide-shape ${d.shape}`}>
                <Icon name={d.icon} />
              </span>
              <div>
                <strong>{d.word}</strong>
                <h2>{d.title}</h2>
                <p>
                  {state === "green"
                    ? "The product details match."
                    : state === "yellow"
                      ? "Wait or scan again online."
                      : "Do not buy or use it."}
                </p>
              </div>
              <Icon name="chevron" />
            </button>
          )
        })}
        <div className="ussd-tip">
          <Icon name="phone" />
          <p>
            No smartphone? Dial <strong>*284*Code#</strong> from any basic
            phone.
          </p>
        </div>
      </div>
    </div>
  )
}

function FeaturePhone() {
  const [step, setStep] = useState(0)
  const screens = [
    <>
      Dial product check:<strong>*284*CODE#</strong>
      <small>Press the green call key</small>
    </>,
    <>
      SCANUGANDA
      <br />
      Enter product code:<strong>4820 9137 1024</strong>
      <small>1. Send&nbsp;&nbsp; 0. Cancel</small>
    </>,
    <>
      <b>GREEN: GENUINE</b>
      <br />
      Kakira Premium Sugar
      <br />
      Safe to buy.<strong>Ref: SU-84A19</strong>
      <small>0. Exit</small>
    </>,
  ]
  return (
    <aside className="ussd-demo">
      <div className="demo-label">
        <span>ALSO WORKS ON BASIC PHONES</span>
        <strong>Same answer. No data needed.</strong>
      </div>
      <div className="feature-phone">
        <div className="speaker" />
        <div className="phone-screen">{screens[step]}</div>
        <div className="phone-nav">
          <button onClick={() => setStep(Math.max(0, step - 1))}>Back</button>
          <span />
          <button onClick={() => setStep(Math.min(2, step + 1))}>
            {step === 2 ? "Exit" : step === 0 ? "Call" : "Send"}
          </button>
        </div>
        <div className="phone-keys">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, "*", 0, "#"].map((x) => (
            <i key={x}>{x}</i>
          ))}
        </div>
      </div>
      <div className="ussd-steps">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            className={step === i ? "active" : ""}
            onClick={() => setStep(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </aside>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome")
  const [dark, setDark] = useState(false)
  const [offline, setOffline] = useState(false)
  const [toast, setToast] = useState("")

  function go(next: Screen) {
    setScreen(next)
    if (next === "home" && screen === "verifying")
      setToast("Scan saved to your history")
  }
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(""), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const screenNames: { label: string; screen: Screen }[] = [
    { label: "Onboarding", screen: "welcome" },
    { label: "Home", screen: "home" },
    { label: "Scanner", screen: "scan" },
    { label: "Green", screen: "green" },
    { label: "Yellow", screen: "yellow" },
    { label: "Red", screen: "red" },
    { label: "Report", screen: "report" },
    { label: "History", screen: "history" },
    { label: "Profile", screen: "profile" },
  ]

  let content: ReactNode
  switch (screen) {
    case "welcome":
      content = <Welcome go={go} />
      break
    case "language":
      content = <Language go={go} />
      break
    case "privacy":
      content = <Privacy go={go} />
      break
    case "auth":
      content = <Auth go={go} />
      break
    case "reset":
      content = <Reset go={go} />
      break
    case "otp":
      content = <Otp go={go} />
      break
    case "home":
      content = <Home go={go} offline={offline} />
      break
    case "scan":
      content = <Scanner go={go} />
      break
    case "manual":
      content = <Manual go={go} />
      break
    case "verifying":
      content = <Verifying go={go} />
      break
    case "green":
      content = <Result state="green" go={go} />
      break
    case "yellow":
      content = <Result state="yellow" go={go} />
      break
    case "red":
      content = <Result state="red" go={go} />
      break
    case "report":
      content = <ReportFlow go={go} offline={offline} />
      break
    case "reportDone":
      content = <ReportDone go={go} offline={offline} />
      break
    case "history":
      content = <History go={go} />
      break
    case "profile":
      content = <Profile go={go} />
      break
    case "settings":
      content = (
        <Settings
          go={go}
          dark={dark}
          setDark={setDark}
          offline={offline}
          setOffline={setOffline}
        />
      )
      break
    case "offline":
      content = <OfflineManager go={go} offline={offline} />
      break
    case "guide":
      content = <Guide go={go} />
      break
  }

  return (
    <div className={`prototype ${dark ? "dark" : ""}`}>
      <aside className="prototype-nav">
        <div className="prototype-brand">
          <span>S</span>
          <div>
            <strong>ScanUganda</strong>
            <small>Mobile experience prototype</small>
          </div>
        </div>
        <p>Explore the complete flow</p>
        <div>
          {screenNames.map((item) => (
            <button
              key={item.screen}
              className={screen === item.screen ? "active" : ""}
              onClick={() => go(item.screen)}
            >
              <span>{item.label}</span>
              <Icon name="chevron" size={15} />
            </button>
          ))}
        </div>
        <button className="mode-preview" onClick={() => setDark(!dark)}>
          <Icon name="moon" size={18} />{" "}
          {dark ? "Preview light mode" : "Preview dark mode"}
        </button>
        <small className="prototype-note">
          Designed for one hand, low-end Android phones, weak networks and
          first-time smartphone users.
        </small>
      </aside>
      <main className="phone-wrap">
        <div className="device">
          <div className="device-top">
            <span>9:41</span>
            <i />
            <div>
              <Icon name="signal" size={14} />
              <b>84%</b>
            </div>
          </div>
          {content}
          {toast && (
            <div className="toast">
              <Icon name="check" size={17} />
              {toast}
            </div>
          )}
          <div className="home-indicator" />
        </div>
      </main>
      <FeaturePhone />
    </div>
  )
}
