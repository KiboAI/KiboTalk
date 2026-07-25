# Landing page design QA

- Reference: `roll-up-banner/banner-4000x10000.png`
- Implementation: `apps/landing`
- Viewports planned: desktop and mobile
- Final result: blocked

## Checks completed

- Confirmed the implementation reuses the banner's KiboTalk wordmark, yellow/black palette, oversized headline treatment, yellow underline, Japan scenario map, real-life scene cards, product suggestion card, and closing mission CTA.
- Confirmed the three locale routes build successfully: `/zh/`, `/ja/`, and `/en/`.
- Confirmed the root route contains locale detection and fallback behavior.
- Confirmed the page uses shared `@kibotalk/ui` components and has no Electron runtime dependency.
- Confirmed the production Caddy configuration serves the landing build at the apex domain and permanently redirects `www` to the apex.

## Blocker

The required screenshot comparison could not be completed in this environment. Safari WebDriver is installed, but macOS requires administrator authentication to enable Remote Automation (`safaridriver --enable`). Chrome and Electron Chromium also exited before creating a browser session in the sandbox.

No browser-specific package or runtime dependency was added to the landing page.
