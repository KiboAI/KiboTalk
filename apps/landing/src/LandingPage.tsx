import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  ExternalLink,
  Languages,
  MapPin,
  Pause,
  Sparkles,
  Square,
  WalletCards,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IslandBar,
  IslandNavButton,
  IslandSeparator,
  IslandStatus,
  PillTag,
  StickyNoteCard,
} from '@kibotalk/ui'
import { copy, locales, type Locale } from './copy'

const webAppUrl = 'https://app.kibotalk.app'
const macReleaseUrl = 'https://github.com/KiboAI/KiboTalk/releases/latest'
const lingguangUrl =
  'https://www.lingguang.com/share/FLASH_APP-47cf7a20-7033-463d-a975-eacb0b0e6c1764'

const localeShortLabel: Record<Locale, string> = {
  zh: '中',
  ja: '日',
  en: 'EN',
}

function rememberLocale(locale: Locale) {
  window.localStorage.setItem('kibotalk-landing-language', locale)
}

function LanguageMenu({ locale }: { locale: Locale }) {
  const content = copy[locale]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={content.localeName}>
          <Languages aria-hidden />
          <span>{localeShortLabel[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((option) => (
          <DropdownMenuItem key={option} asChild>
            <a
              className="flex items-center justify-between gap-5"
              href={`/${option}/${window.location.hash}`}
              hrefLang={option}
              onClick={() => rememberLocale(option)}
            >
              {copy[option].localeName}
              {option === locale ? <Check aria-hidden /> : null}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Header({ locale }: { locale: Locale }) {
  const content = copy[locale]

  return (
    <header className="site-header">
      <div className="page-shell flex h-19 items-center justify-between gap-5">
        <a href={`/${locale}/`} aria-label="KiboTalk">
          <img
            className="h-auto w-35 sm:w-40"
            src="/assets/kibotalk-wordmark.svg"
            alt="KiboTalk"
          />
        </a>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          <a className="header-link" href="#scenes">
            {content.nav.scenes}
          </a>
          <a className="header-link" href="#product">
            {content.nav.product}
          </a>
          <a className="header-link" href="#story">
            {content.nav.story}
          </a>
          <a className="header-link" href="#payment">
            {content.nav.payment}
          </a>
          <a className="header-link" href="#mission">
            {content.nav.mission}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <LanguageMenu locale={locale} />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <a href={webAppUrl}>
              {content.actions.web}
              <ArrowUpRight aria-hidden />
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}

function Hero({ locale }: { locale: Locale }) {
  const { hero, actions } = copy[locale]

  return (
    <section className="hero-section page-shell" aria-labelledby="hero-title">
      <p className="section-kicker hero-enter">{hero.eyebrow}</p>
      <h1 id="hero-title" className="hero-title hero-enter hero-enter-delay-1">
        <span>{hero.titleLead}</span>
        <mark>{hero.titleMark}</mark>
      </h1>
      <p className="hero-statement hero-enter hero-enter-delay-2">
        {hero.statementLead}
        <strong>{hero.statementStrong}</strong>
      </p>
      <p className="hero-tagline hero-enter hero-enter-delay-2">{hero.tagline}</p>

      <div className="hero-actions hero-enter hero-enter-delay-3">
        <div>
          <Button asChild size="lg">
            <a href={webAppUrl}>
              {actions.web}
              <ArrowUpRight aria-hidden />
            </a>
          </Button>
          <p>{hero.webNote}</p>
        </div>
        <div>
          <Button asChild variant="soft" size="lg">
            <a href={macReleaseUrl} target="_blank" rel="noreferrer">
              <ArrowDownToLine aria-hidden />
              {actions.mac}
            </a>
          </Button>
          <p>{hero.macNote}</p>
        </div>
      </div>
    </section>
  )
}

function SceneCard({
  item,
  index,
}: {
  item: (typeof copy.zh.scenes.items)[number]
  index: number
}) {
  return (
    <article className={`scene-card scene-card-${index}`}>
      <img src={item.image} alt={item.imageAlt} />
      <strong>{item.title}</strong>
      <span>{item.detail}</span>
    </article>
  )
}

function SceneMap({ locale }: { locale: Locale }) {
  const { scenes } = copy[locale]

  return (
    <section id="scenes" className="scenes-section">
      <div className="page-shell scene-layout">
        <div className="scene-heading">
          <p className="section-kicker">{scenes.eyebrow}</p>
          <h2 className="section-title">
            {scenes.titleLead}
            <mark>{scenes.titleMark}</mark>
          </h2>
        </div>

        <div className="scene-map" aria-label={scenes.ariaLabel}>
          <img className="map-image" src="/assets/map.png" alt="" />
          <img className="connector connector-0" src="/assets/connector-1.png" alt="" />
          <img className="connector connector-1" src="/assets/connector-1.png" alt="" />
          <img className="connector connector-2" src="/assets/connector-1.png" alt="" />
          <img className="connector connector-3" src="/assets/connector-1.png" alt="" />
          <img className="connector connector-4" src="/assets/connector-1.png" alt="" />
          {scenes.items.map((item, index) => (
            <SceneCard key={item.title} item={item} index={index} />
          ))}
          {[0, 1, 2, 3, 4].map((pin) => (
            <MapPin
              key={pin}
              className={`map-pin map-pin-${pin}`}
              fill="currentColor"
              strokeWidth={2.6}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function ProductDemo({ locale }: { locale: Locale }) {
  const { product } = copy[locale]
  const candidates = product.candidates.map((candidate, index) => ({
    id: `landing-${index}`,
    ...candidate,
  }))

  return (
    <div className="product-demo" aria-label="KiboTalk live reply interface">
      <div className="transcript-strip">
        <strong>{product.transcriptSpeaker}</strong>
        <span>{product.transcript}</span>
      </div>
      <div className="suggestion-meta">
        <span>{product.suggestionLabel}</span>
        <span>{product.now}</span>
      </div>
      <StickyNoteCard candidates={candidates} className="!w-full !max-w-none" />
      <IslandBar className="mx-auto mt-5 w-fit max-w-full">
        <IslandStatus label={product.listening} pulse />
        <IslandSeparator />
        <IslandNavButton label="Pause">
          <Pause aria-hidden />
        </IslandNavButton>
        <IslandNavButton label="Stop">
          <Square aria-hidden />
        </IslandNavButton>
        <IslandNavButton label="AI suggestions">
          <Sparkles aria-hidden />
        </IslandNavButton>
      </IslandBar>
    </div>
  )
}

function ProductSection({ locale }: { locale: Locale }) {
  const { product } = copy[locale]

  return (
    <section id="product" className="product-section">
      <div className="page-shell product-layout">
        <div className="product-copy">
          <p className="section-kicker">{product.eyebrow}</p>
          <h2 className="section-title">
            {product.titleLead}
            <mark>{product.titleMark}</mark>
          </h2>
          <p className="section-body">{product.body}</p>
        </div>
        <ProductDemo locale={locale} />
      </div>
    </section>
  )
}

function StorySection({ locale }: { locale: Locale }) {
  const { story, actions } = copy[locale]

  return (
    <section id="story" className="story-section">
      <div className="page-shell">
        <div className="story-heading">
          <p className="section-kicker">{story.eyebrow}</p>
          <h2 className="section-title">{story.title}</h2>
          <p className="section-body">{story.body}</p>
        </div>

        <div className="story-grid">
          <Card className="story-card lite-card">
            <CardContent>
              <div className="story-card-topline">
                <Badge variant="secondary">{story.liteLabel}</Badge>
                <span>01</span>
              </div>
              <img className="lite-icon" src="/assets/kibo-icon.png" alt="" />
              <h3>{story.liteTitle}</h3>
              <p>{story.liteBody}</p>
              <ol className="story-steps">
                {story.steps.map((step, index) => (
                  <li key={step}>
                    <span>{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <Button asChild variant="outline">
                <a href={lingguangUrl} target="_blank" rel="noreferrer">
                  {actions.lite}
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="story-card production-card">
            <CardContent>
              <div className="story-card-topline">
                <Badge>{story.productionLabel}</Badge>
                <span>02</span>
              </div>
              <img
                className="production-wordmark"
                src="/assets/kibotalk-wordmark-no-border.svg"
                alt="KiboTalk"
              />
              <h3>{story.productionTitle}</h3>
              <p>{story.productionBody}</p>
              <div className="capability-list">
                {story.capabilities.map((capability) => (
                  <PillTag key={capability}>
                    <Check aria-hidden />
                    {capability}
                  </PillTag>
                ))}
              </div>
              <Button asChild>
                <a href={webAppUrl}>
                  {actions.web}
                  <ArrowUpRight aria-hidden />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}

function PaymentSection({ locale }: { locale: Locale }) {
  const { payment } = copy[locale]

  return (
    <section id="payment" className="payment-section">
      <div className="page-shell payment-layout">
        <div className="payment-copy">
          <p className="section-kicker">{payment.eyebrow}</p>
          <h2 className="section-title">{payment.title}</h2>
          <p className="section-body">{payment.body}</p>
          <div className="payment-context">
            <Badge variant="outline">{payment.testnetLabel}</Badge>
            <span>{payment.hackathonNote}</span>
          </div>
        </div>

        <Card className="payment-card">
          <CardContent>
            <div className="payment-rail">
              <span className="payment-icon">
                <WalletCards aria-hidden />
              </span>
              <span className="payment-rail-copy">
                <strong>Injective</strong>
                <span>{payment.injectiveDetail}</span>
              </span>
              <Badge variant="secondary">{payment.soon}</Badge>
            </div>

            <div className="payment-rail">
              <span className="payment-icon">
                <CircleDollarSign aria-hidden />
              </span>
              <span className="payment-rail-copy">
                <strong>USDC</strong>
                <span>{payment.usdcDetail}</span>
              </span>
              <Badge variant="secondary">{payment.soon}</Badge>
            </div>

            <Button type="button" disabled className="w-full">
              {payment.button}
            </Button>
            <p className="payment-disclaimer">{payment.disclaimer}</p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function MissionSection({ locale }: { locale: Locale }) {
  const { mission, actions } = copy[locale]

  return (
    <section id="mission" className="mission-section">
      <div className="page-shell mission-layout">
        <div>
          <p className="section-kicker">{mission.eyebrow}</p>
          <h2 className="section-title">
            {mission.titleLead}
            <mark>{mission.titleMark}</mark>
          </h2>
          <p className="section-body">{mission.body}</p>
        </div>

        <div className="mission-actions">
          <div>
            <Button asChild size="lg">
              <a href={webAppUrl}>
                {actions.web}
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
          </div>
          <div className="desktop-download">
            <Button asChild variant="soft" size="lg">
              <a href={macReleaseUrl} target="_blank" rel="noreferrer">
                <ArrowDownToLine aria-hidden />
                {actions.mac}
              </a>
            </Button>
            <p>{mission.compatibility}</p>
            <p>{mission.gatekeeper}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer({ locale }: { locale: Locale }) {
  const { footer, actions } = copy[locale]

  return (
    <footer className="site-footer">
      <div className="page-shell footer-layout">
        <div>
          <img
            className="footer-wordmark"
            src="/assets/kibotalk-wordmark-no-border.svg"
            alt="KiboTalk"
          />
          <p>{footer.statement}</p>
        </div>
        <div className="footer-links">
          <a href={lingguangUrl} target="_blank" rel="noreferrer">
            {footer.original}
            <ArrowUpRight aria-hidden />
          </a>
          <a href={macReleaseUrl} target="_blank" rel="noreferrer">
            {footer.release}
            <ArrowUpRight aria-hidden />
          </a>
          <a href="#top">{actions.top}</a>
        </div>
      </div>
    </footer>
  )
}

export function LandingPage({ locale }: { locale: Locale }) {
  return (
    <div id="top" className="landing-page">
      <Header locale={locale} />
      <main>
        <Hero locale={locale} />
        <SceneMap locale={locale} />
        <ProductSection locale={locale} />
        <StorySection locale={locale} />
        <PaymentSection locale={locale} />
        <MissionSection locale={locale} />
      </main>
      <Footer locale={locale} />
    </div>
  )
}
