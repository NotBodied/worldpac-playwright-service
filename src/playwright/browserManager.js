const { chromium } = require("playwright");

let browser;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
    });
    console.log("🧠 Browser launched");
  }
  return browser;
}

module.exports = { getBrowser };