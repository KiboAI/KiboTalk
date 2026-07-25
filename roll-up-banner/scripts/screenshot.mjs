import { chromium } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const scale = 5
const url = process.env.BANNER_URL ?? 'http://127.0.0.1:5199/'

const browser = await chromium.launch()
const probe = await browser.newPage({
  viewport: { width: 900, height: 2200 },
  deviceScaleFactor: 1,
})

await probe.goto(url, { waitUntil: 'networkidle' })

const metrics = await probe.evaluate(() => {
  const poster = document.getElementById('poster')
  if (!poster) {
    throw new Error('Missing #poster')
  }

  poster.style.margin = '0'
  poster.style.boxShadow = 'none'
  document.documentElement.style.margin = '0'
  document.documentElement.style.padding = '0'
  document.body.style.margin = '0'
  document.body.style.padding = '0'
  document.body.style.background = 'transparent'

  const rect = poster.getBoundingClientRect()
  return {
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
  }
})

await probe.close()

const outputPath = join(root, `banner-${metrics.width * scale}x${metrics.height * scale}.png`)
const context = await browser.newContext({
  viewport: { width: metrics.width, height: metrics.height },
  deviceScaleFactor: scale,
})
const page = await context.newPage()

await page.goto(url, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  const poster = document.getElementById('poster')
  if (!poster) {
    return
  }

  poster.style.margin = '0'
  poster.style.boxShadow = 'none'
  document.documentElement.style.margin = '0'
  document.documentElement.style.padding = '0'
  document.body.style.margin = '0'
  document.body.style.padding = '0'
  document.body.style.background = 'transparent'
})

await page.locator('#poster').screenshot({
  path: outputPath,
  type: 'png',
})

await browser.close()

console.log(`Saved ${outputPath}`)
console.log(`Poster ${metrics.width}x${metrics.height} at ${scale}x -> ${metrics.width * scale}x${metrics.height * scale}`)
