import { GologinApi } from 'gologin';
import dotenv from 'dotenv';
dotenv.config();

// Token can be passed here in code or from env 
const token = process.env.GL_API_TOKEN || 'your dev token here';
const gologin = GologinApi({
  token,
  // If you want to run particular profile you need to pass profileId param
});

console.log(token);

async function main() {
//   const profileId = "689494cafa299cfeda054a8b";
   const profileId = "689494cafa299cfeda054a83";
  
  const { browser } = await gologin.launch({ profileId });

  // Opens new page in browser
  const page = await browser.newPage();

  // Goes to website and waits untill all parts of the website is loaded
  await page.goto('https://iphey.com/', { waitUntil: 'networkidle2' });

  // Reads profile check result in website
  const status = await page.$eval('.trustworthy:not(.hide)',
    (elt) => elt?.innerText?.trim(),
  );

  await new Promise((resolve) => setTimeout(resolve, 10000));
  console.log('status', status);

  return status;
}

main().catch(console.error)
  .finally(gologin.exit);