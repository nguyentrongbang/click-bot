import puppeteer, { Page } from 'puppeteer-core'
import dotenv from 'dotenv'

dotenv.config()

const KEYWORD = process.env.KEYWORD || 'net88'
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'net88.com'
const CHROME_WS_ENDPOINT = process.env.CHROME_WS_ENDPOINT!

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function simulateUser(page: Page) {
  const random = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min

  const actions = [
    async () => {
      await page.mouse.move(random(100, 800), random(100, 600), { steps: 10 })
      await sleep(random(500, 1000))
    },
    async () => {
      await page.mouse.wheel({ deltaY: random(100, 500) })
      await sleep(random(1000, 2000))
    },
    async () => {
      const links = await page.$$('a')
      if (links.length) {
        const randomLink = links[random(0, links.length - 1)]
        await randomLink.hover()
        await sleep(random(500, 1000))
        // 20% xác suất click
        if (Math.random() < 0.2) {
          try {
            await Promise.all([
              randomLink.click(),
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {})
            ])
          } catch {}
        }
      }
    },
    async () => {
      const buttons = await page.$$('button')
      if (buttons.length) {
        const randomButton = buttons[random(0, buttons.length - 1)]
        await randomButton.hover()
        await sleep(random(500, 1000))
      }
    }
  ]

  const rounds = random(5, 10)
  for (let i = 0; i < rounds; i++) {
    const action = actions[random(0, actions.length - 1)]
    await action()
  }

  console.log('✅ Đã giả lập xong hành vi người dùng')
}

async function run() {
  try {
    const browser = await puppeteer.connect({
      browserWSEndpoint: CHROME_WS_ENDPOINT,
      defaultViewport: null
    })

    const page = await browser.newPage()
    console.log(`🔍 Searching for: ${KEYWORD}`)

    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' })

    await page.waitForSelector('textarea[name="q"]', { timeout: 10000 })
    await page.type('textarea[name="q"]', KEYWORD)
    await page.keyboard.press('Enter')

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 })

    const links = await page.$$('a')
    for (const link of links) {
      const href = await link.evaluate(el => el.getAttribute('href') || '')
      if (href.includes(TARGET_DOMAIN)) {
        console.log(`✅ Found link: ${href}`)

        await Promise.all([
          link.click(),
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => {
            console.warn('⚠️ Navigation timeout, continue anyway.')
          })
        ])

        await simulateUser(page)
        console.log('🌀 Simulated user activity...')
        break
      }
    }

    console.log('⏳ Waiting before next round...')
    await sleep(10000)
    await page.close()
    await run()

  } catch (err) {
    if (err instanceof Error) {
      console.error('❌ Error occurred:', err.message)
    } else {
      console.error('❌ Unknown error occurred:', err)
    }
    console.log('🔁 Restarting...')
    await sleep(5000) // đợi một chút rồi chạy lại
    await run()
  }
}

run()