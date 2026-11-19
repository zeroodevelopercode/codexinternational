import { useEffect, useState, type FormEvent } from 'react'
import '../styles/landing.css'
import codexLogo from '../assets/codex-logo.jpg'
import { ApiError } from '../api/client'
import {
  isOAuthConfigured,
  loginWithPassword,
  registerAccount,
  sendEmailOtp,
  startOAuthFlow,
  verifyEmailOtp,
  type OAuthProvider,
} from '../api/auth'
import { useViewport } from '../hooks/useViewport'

type AuthTab = 'otp' | 'password' | 'register'
type MobileStep = 'welcome' | 'otp-email' | 'otp-verify' | 'password' | 'register'

const BRAND = 'Codex Internasional Community'

function BrandMark({ size = 52 }: { size?: number }) {
  return (
    <img
      className="landing-brand-mark"
      src={codexLogo}
      alt="Codex International"
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  )
}

function GoogleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.4-4.8 7.1l7.6 5.9c4.4-4.1 7-10.1 7-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

function GitHubIcon() {
  return <i className="fa-brands fa-github" style={{ fontSize: 18 }} aria-hidden="true" />
}

interface LandingProps {
  onAuthenticated: () => void
  initialError?: string
}

/**
 * Adaptive Auth Landing:
 * - Desktop / Tablet Web (`!isMobile`): split two-column layout with architecture pillars & tabbed auth card.
 * - Mobile (`isMobile`): native-style stacked welcome + step-by-step screens with thumb-friendly controls.
 *
 * Security: OTP codes are verified strictly on the Rust backend (Brevo + Valkey SHA-256 hash);
 * no OTP code is ever stored on the client.
 */
export function Landing({ onAuthenticated, initialError = '' }: LandingProps) {
  const { isMobile } = useViewport()
  const [desktopTab, setDesktopTab] = useState<AuthTab>('otp')
  const [mobileStep, setMobileStep] = useState<MobileStep>('welcome')
  const [stepDir, setStepDir] = useState<'forward' | 'back'>('forward')
  const [otpSent, setOtpSent] = useState(false)

  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')

  const [cooldownSecs, setCooldownSecs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (cooldownSecs <= 0) return
    const timer = window.setInterval(() => {
      setCooldownSecs((prev) => (prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownSecs])

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim())

  // --goStep--

  const goStep = (step: MobileStep, dir: 'forward' | 'back' = 'forward') => {
    setError('')
    setInfo('')
    setStepDir(dir)
    setMobileStep(step)
  }

  const handleApiFailure = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.retryAfterSecs && err.retryAfterSecs > 0) {
        setCooldownSecs(err.retryAfterSecs)
      }
      setError(err.message)
      return
    }
    setError(err instanceof Error ? err.message : 'Authentication request failed.')
  }

  const handleSendOtp = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!validEmail || busy || cooldownSecs > 0) return
    setError('')
    setInfo('')
    setBusy(true)
    try {
      const res = await sendEmailOtp(email.trim(), 'login')
      setOtpSent(true)
      setCooldownSecs(res.next_retry_after_secs > 0 ? res.next_retry_after_secs : 60)
      setInfo(`6-digit OTP sent to ${email.trim()}. Expires in ${Math.round(res.expires_in_secs / 60)} min.`)
      if (isMobile) {
        setStepDir('forward')
        setMobileStep('otp-verify')
      }
    } catch (err) {
      handleApiFailure(err)
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault()
    if (otpCode.trim().length !== 6 || busy) return
    setError('')
    setBusy(true)
    try {
      await verifyEmailOtp(email.trim(), otpCode.trim())
      onAuthenticated()
    } catch (err) {
      handleApiFailure(err)
    } finally {
      setBusy(false)
    }
  }

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!identifier.trim() || !password || busy) return
    setError('')
    setBusy(true)
    try {
      await loginWithPassword({ identifier: identifier.trim(), password })
      onAuthenticated()
    } catch (err) {
      handleApiFailure(err)
    } finally {
      setBusy(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !displayName.trim() || !validEmail || password.length < 8 || busy) {
      setError('Fill username, display name, valid email, and password (min 8 chars).')
      return
    }
    setError('')
    setBusy(true)
    try {
      await registerAccount({
        username: username.trim(),
        display_name: displayName.trim(),
        email: email.trim(),
        password,
      })
      onAuthenticated()
    } catch (err) {
      handleApiFailure(err)
    } finally {
      setBusy(false)
    }
  }

  const handleOAuth = (provider: OAuthProvider) => {
    setError('')
    setInfo('')
    if (!isOAuthConfigured(provider)) {
      const envKey =
        provider === 'github' ? 'VITE_OAUTH_GITHUB_CLIENT_ID' : 'VITE_OAUTH_GOOGLE_CLIENT_ID'
      setInfo(`${provider} OAuth is not configured yet (${envKey}). Use Email OTP or Password login.`)
      return
    }
    const url = startOAuthFlow(provider)
    if (url) {
      window.location.href = url
    }
  }

  const renderOAuthButtons = () => (
    <div className="landing-oauth-row">
      <button
        type="button"
        className="oauth-btn"
        disabled={busy}
        onClick={() => handleOAuth('google')}
      >
        <span className="oauth-icon"><GoogleIcon /></span>
        <span>Google</span>
      </button>
      <button
        type="button"
        className="oauth-btn"
        disabled={busy}
        onClick={() => handleOAuth('github')}
      >
        <span className="oauth-icon"><GitHubIcon /></span>
        <span>GitHub</span>
      </button>
    </div>
  )


  const renderOtpSection = (showEmailField: boolean, showCodeField: boolean) => (
    <>
      {showEmailField && (
        <form className="landing-form" onSubmit={handleSendOtp} noValidate>
          <label className="landing-field-label" htmlFor="otp-email">EMAIL ADDRESS</label>
          <input
            id="otp-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="landing-input"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            className={`landing-continue ${validEmail && !busy && cooldownSecs === 0 ? 'is-ready' : ''}`}
            disabled={!validEmail || busy || cooldownSecs > 0}
          >
            {busy
              ? 'Sending OTP…'
              : cooldownSecs > 0
                ? `Wait ${cooldownSecs}s to resend`
                : otpSent
                  ? 'Resend 6-digit code'
                  : 'Send login code'}
          </button>
        </form>
      )}

      {showCodeField && (
        <form className="landing-form" onSubmit={handleVerifyOtp} noValidate>
          <label className="landing-field-label" htmlFor="otp-code">6-DIGIT CODE FOR {email.trim()}</label>
          <input
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="landing-input landing-otp-input"
            placeholder="000000"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
            disabled={busy}
          />
          <button
            type="submit"
            className={`landing-continue ${otpCode.length === 6 && !busy ? 'is-ready' : ''}`}
            disabled={otpCode.length !== 6 || busy}
          >
            {busy ? 'Verifying…' : 'Verify & sign in'}
          </button>
          <p className="landing-help">
            Need another code?{' '}
            <button type="button" disabled={busy || cooldownSecs > 0} onClick={() => void handleSendOtp()}>
              {cooldownSecs > 0 ? `Resend in ${cooldownSecs}s` : 'Resend'}
            </button>
          </p>
        </form>
      )}
    </>
  )

  const renderPasswordSection = () => (
    <form className="landing-form" onSubmit={handlePasswordLogin} noValidate>
      <label className="landing-field-label" htmlFor="login-id">USERNAME OR EMAIL</label>
      <input
        id="login-id"
        type="text"
        autoComplete="username"
        className="landing-input"
        placeholder="username or email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        disabled={busy}
      />
      <label className="landing-field-label" htmlFor="login-pass">PASSWORD</label>
      <input
        id="login-pass"
        type="password"
        autoComplete="current-password"
        className="landing-input"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
      />
      <button
        type="submit"
        className={`landing-continue ${identifier.trim() && password && !busy ? 'is-ready' : ''}`}
        disabled={!identifier.trim() || !password || busy}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )

  const renderRegisterSection = () => (
    <form className="landing-form" onSubmit={handleRegister} noValidate>
      <label className="landing-field-label" htmlFor="reg-user">USERNAME</label>
      <input
        id="reg-user"
        type="text"
        autoComplete="username"
        className="landing-input"
        placeholder="codex_builder"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={busy}
      />
      <label className="landing-field-label" htmlFor="reg-display">DISPLAY NAME</label>
      <input
        id="reg-display"
        type="text"
        autoComplete="name"
        className="landing-input"
        placeholder="Codex Builder"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        disabled={busy}
      />
      <label className="landing-field-label" htmlFor="reg-email">EMAIL ADDRESS</label>
      <input
        id="reg-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        className="landing-input"
        placeholder="you@domain.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />
      <label className="landing-field-label" htmlFor="reg-pass">PASSWORD (MIN 8 CHARS)</label>
      <input
        id="reg-pass"
        type="password"
        autoComplete="new-password"
        className="landing-input"
        placeholder="At least 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
      />
      <button
        type="submit"
        className={`landing-continue ${username.trim() && displayName.trim() && validEmail && password.length >= 8 && !busy ? 'is-ready' : ''}`}
        disabled={busy}
      >
        {busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )

  return (
    <div className="landing-shell">
      <span className="landing-circle" aria-hidden="true" />
      <span className="landing-block" aria-hidden="true" />

      {!isMobile ? (
        /* ── Desktop & Tablet Web Split View ── */
        <main className="landing-desktop-frame">
          <section className="landing-showcase">
            <div className="landing-badge-row">
              <BrandMark size={48} />
              <span className="landing-lbl">Komunitas coding</span>
            </div>
            <h1>Welcome to {BRAND}</h1>
            <p className="landing-showcase-lead">
              A high-throughput IT community hub uniting channels, DMs, public social posts, and isolated bot runtimes.
            </p>
            <div className="landing-pillars">
              <div className="landing-pillar">
                <strong>Server-Verified Brevo OTP</strong>
                <span>6-digit codes are SHA-256 hashed in Valkey with exponential 24h backoff — never stored on your browser.</span>
              </div>
              <div className="landing-pillar">
                <strong>Rotating Device Sessions</strong>
                <span>Short-lived Bearer JWTs paired with per-device refresh tokens and replay reuse detection.</span>
              </div>
              <div className="landing-pillar">
                <strong>Isolated Bot Portal &amp; One-Time Tokens</strong>
                <span>Register chmod-scoped bots and copy one-time credentials straight to your VPS secret manager.</span>
              </div>
            </div>
          </section>

          <section className="landing-card">
            <div className="landing-card-head">
              <h2>Sign in or create account</h2>
              <p>Authenticate directly against the Codex Rust backend.</p>
            </div>

            <div className="landing-mode-tabs" role="tablist" aria-label="Authentication methods">
              <button
                type="button"
                role="tab"
                aria-selected={desktopTab === 'otp'}
                className={desktopTab === 'otp' ? 'active' : ''}
                onClick={() => {
                  setDesktopTab('otp')
                  setError('')
                }}
              >
                Email OTP
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={desktopTab === 'password'}
                className={desktopTab === 'password' ? 'active' : ''}
                onClick={() => {
                  setDesktopTab('password')
                  setError('')
                }}
              >
                Password
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={desktopTab === 'register'}
                className={desktopTab === 'register' ? 'active' : ''}
                onClick={() => {
                  setDesktopTab('register')
                  setError('')
                }}
              >
                Register
              </button>
            </div>

            {error && <p className="landing-error">{error}</p>}
            {info && <p className="landing-info">{info}</p>}

            {desktopTab === 'otp' && renderOtpSection(true, otpSent)}
            {desktopTab === 'password' && renderPasswordSection()}
            {desktopTab === 'register' && renderRegisterSection()}

            <div className="landing-or"><span>OR CONTINUE WITH</span></div>
            {renderOAuthButtons()}
          </section>
        </main>
      ) : (
        /* ── Mobile Step-by-Step Native App Flow ── */
        <div className="landing-screen" data-dir={stepDir}>
          {mobileStep !== 'welcome' && (
            <header className="landing-topbar">
              <button
                type="button"
                className="landing-back"
                aria-label="Back"
                onClick={() => goStep(mobileStep === 'otp-verify' ? 'otp-email' : 'welcome', 'back')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="m15 5-7 7 7 7" />
                </svg>
              </button>
              <span>
                {mobileStep === 'otp-email'
                  ? 'Email OTP'
                  : mobileStep === 'otp-verify'
                    ? 'Verify code'
                    : mobileStep === 'register'
                      ? 'Create account'
                      : 'Sign in'}
              </span>
            </header>
          )}

          {mobileStep === 'welcome' && (
            <>
              <div className="landing-hero">
                <BrandMark size={84} />
                <span className="landing-lbl">Komunitas coding</span>
                <h1>Welcome to {BRAND}</h1>
                <p className="landing-hero-sub">
                  Sign in with server-verified Email OTP, password, or OAuth2.
                </p>
              </div>
              <div className="landing-actions">
                {error && <p className="landing-error">{error}</p>}
                {info && <p className="landing-info">{info}</p>}
                <button
                  type="button"
                  className="oauth-btn"
                  onClick={() => goStep('otp-email')}
                >
                  Continue with Email OTP
                </button>
                <button
                  type="button"
                  className="oauth-btn"
                  onClick={() => goStep('password')}
                >
                  Sign in with Password
                </button>
                <button
                  type="button"
                  className="oauth-btn"
                  onClick={() => goStep('register')}
                >
                  Create new account
                </button>
                <div className="landing-or"><span>OR</span></div>
                {renderOAuthButtons()}
                  </div>
            </>
          )}

          {mobileStep === 'otp-email' && (
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <p className="landing-error">{error}</p>}
              {info && <p className="landing-info">{info}</p>}
              {renderOtpSection(true, false)}
            </div>
          )}

          {mobileStep === 'otp-verify' && (
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <p className="landing-error">{error}</p>}
              {info && <p className="landing-info">{info}</p>}
              {renderOtpSection(false, true)}
            </div>
          )}

          {mobileStep === 'password' && (
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <p className="landing-error">{error}</p>}
              {renderPasswordSection()}
            </div>
          )}

          {mobileStep === 'register' && (
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <p className="landing-error">{error}</p>}
              {renderRegisterSection()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
