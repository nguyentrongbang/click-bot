import puppeteer, { Page } from "puppeteer-core";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const KEYWORD = process.env.KEYWORD || "net88";
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || "net88.com";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateUser(page: Page) {
  const random = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  const actions = [
    async () => {
      const x = random(100, 1000);
      const y = random(100, 700);
      console.log(`🖱 Moving mouse to (${x}, ${y})`);
      await page.mouse.move(x, y, { steps: 20 });
      await sleep(random(300, 800));
    },
    async () => {
      const deltaY = random(100, 600);
      console.log(`📜 Scrolling down: ${deltaY}`);
      await page.mouse.wheel({ deltaY });
      await sleep(random(500, 1200));
    },
    async () => {
      const deltaY = random(100, 300);
      console.log(`📜 Scrolling up: ${deltaY}`);
      await page.mouse.wheel({ deltaY: -deltaY });
      await sleep(random(500, 1200));
    },
    async () => {
      const links = await page.$$("a");
      if (links.length) {
        const link = links[random(0, links.length - 1)];
        try {
          const box = await link.boundingBox();
          if (box) {
            console.log(`🔗 Hovering a random link`);
            await link.hover();
            await sleep(random(300, 800));

            if (Math.random() < 0.2) {
              console.log("🖱 Clicking on link...");
              await Promise.all([
                link.click({ delay: 100 }),
                page
                  .waitForNavigation({
                    waitUntil: "domcontentloaded",
                    timeout: 5000,
                  })
                  .catch(() => {
                    console.warn("⚠️ Timeout after clicking link");
                  }),
              ]);
            }
          }
        } catch (e: any) {
          console.warn("⚠️ Error on link hover/click:", e.message);
        }
      }
    },
    async () => {
      const buttons = await page.$$("button");
      if (buttons.length) {
        const button = buttons[random(0, buttons.length - 1)];
        try {
          const box = await button.boundingBox();
          if (box) {
            console.log(`🔘 Hovering a button`);
            await button.hover();
            await sleep(random(300, 800));
          }
        } catch (e: any) {
          console.warn("⚠️ Error on button hover:", e.message);
        }
      }
    },
  ];

  const rounds = random(6, 12);
  for (let i = 0; i < rounds; i++) {
    const action = actions[random(0, actions.length - 1)];
    try {
      await action();
    } catch (e: any) {
      console.warn("⚠️ simulateUser error:", e.message);
    }
  }

  console.log("✅ Đã giả lập xong hành vi người dùng");
}

async function run() {
  try {
    const CHROME_WS_ENDPOINT = process.env.CHROME_WS_ENDPOINT!;

    const browser = await puppeteer.connect({
      browserWSEndpoint: CHROME_WS_ENDPOINT,
      defaultViewport: null,
      protocolTimeout: 60000,
    });

    const page = await browser.newPage();

    await page.goto("https://api.ipify.org");
    const ip = await page.evaluate(() => document.body.innerText);
    console.log("💡 IP công khai của bạn là:", ip);

    await sleep(1000);

    console.log(`🔍 Searching for: ${KEYWORD}`);

    await page.goto("https://www.google.com", {
      waitUntil: "domcontentloaded",
    });

    await page.waitForSelector('textarea[name="q"]', { timeout: 10000 });
    await page.type('textarea[name="q"]', KEYWORD);
    await page.keyboard.press("Enter");

    await page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await sleep(1000);

    const links = await page.$$("a");

    if (links.length === 0) {
      console.log("❌ Không tìm thấy link nào trên trang.");
    } else {
      console.log(`✅ Tìm thấy ${links.length} link.`);
    }

    for (const link of links) {
      const href = await link.evaluate((el) => el.getAttribute("href") || "");
      if (href.includes(TARGET_DOMAIN)) {
        console.log(`✅ Found link: ${href}`);

        const oldPages = await browser.pages();
        await link.click({ delay: 100 });
        await sleep(3000);

        const newPages = await browser.pages();
        const newTab = newPages.find((p) => !oldPages.includes(p));

        if (newTab) {
          console.log("🆕 New tab detected, switching...");
          await newTab.bringToFront();
          await simulateUser(newTab);
          await newTab.close();
        } else {
          console.log("📄 No new tab, stay on current page.");
          await simulateUser(page);
        }

        console.log("🌀 Simulated user activity...");
        break;
      } else {
        console.log(href);
      }
    }

    console.log("⏳ Waiting before next round...");
    await sleep(5000);
    await page.close();
    await run();
  } catch (err: any) {
    console.error("❌ Error in run():", err.message || err);
    console.log("🔁 Restarting after 5s...");
    await sleep(5000);
    await run(); // retry loop
  }
}

// Catch global unhandled errors
process.on("unhandledRejection", (reason) => {
  console.error("❗ Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("❗ Uncaught Exception:", err);
});

run();
