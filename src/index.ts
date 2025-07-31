import puppeteer, { Page } from "puppeteer-core";
import dotenv from "dotenv";

dotenv.config();

const KEYWORD = process.env.KEYWORD || "net88";
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || "net88.com";
const CHROME_WS_ENDPOINT = process.env.CHROME_WS_ENDPOINT!;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateUser(page: Page) {
  const random = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  const actions = [
    async () => {
      // Di chuyển chuột ngẫu nhiên
      const x = random(100, 1000);
      const y = random(100, 700);
      console.log(`🖱 Moving mouse to (${x}, ${y})`);
      await page.mouse.move(x, y, { steps: 20 });
      await sleep(random(300, 800));
    },
    async () => {
      // Cuộn trang xuống
      const deltaY = random(100, 600);
      console.log(`📜 Scrolling down: ${deltaY}`);
      await page.mouse.wheel({ deltaY });
      await sleep(random(500, 1200));
    },
    async () => {
      // Cuộn trang lên
      const deltaY = random(100, 300);
      console.log(`📜 Scrolling up: ${deltaY}`);
      await page.mouse.wheel({ deltaY: -deltaY });
      await sleep(random(500, 1200));
    },
    async () => {
      // Hover + có thể click vào link
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
          } else {
            console.warn("⚠️ Skipped link: not visible");
          }
        } catch (e: any) {
          console.warn("⚠️ Error on link hover/click:", e.message);
        }
      }
    },
    async () => {
      // Hover button
      const buttons = await page.$$("button");
      if (buttons.length) {
        const button = buttons[random(0, buttons.length - 1)];
        try {
          const box = await button.boundingBox();
          if (box) {
            console.log(`🔘 Hovering a button`);
            await button.hover();
            await sleep(random(300, 800));
          } else {
            console.warn("⚠️ Skipped button: not visible");
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
    const browser = await puppeteer.connect({
      browserWSEndpoint: CHROME_WS_ENDPOINT,
      defaultViewport: null,
    });

    const page = await browser.newPage();
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

    const links = await page.$$("a");
    for (const link of links) {
      const href = await link.evaluate((el) => el.getAttribute("href") || "");
      if (href.includes(TARGET_DOMAIN)) {
        console.log(`✅ Found link: ${href}`);

        const oldPages = await browser.pages();
        await link.click({ delay: 100 });
        await sleep(3000); // đợi xem tab mới có mở không

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
      }
    }

    console.log("⏳ Waiting before next round...");
    await sleep(10000);
    await page.close();
    await run();
  } catch (err) {
    if (err instanceof Error) {
      console.error("❌ Error occurred:", err.message);
    } else {
      console.error("❌ Unknown error occurred:", err);
    }
    console.log("🔁 Restarting...");
    await sleep(5000); // đợi một chút rồi chạy lại
    await run();
  }
}

run();
