const { getSession } = require("./sessionManager");

async function ensureLoggedIn(page) {
  console.log("🔐 Checking login state...");

  // Go to login page always (safe starting point)
  await page.goto("https://speeddial.worldpac.com/#/login", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});

  await page.waitForSelector('input[placeholder="User ID"]', {
  timeout: 15000,
});

  // Check if already logged in (URL changes or dashboard element exists)
  if (!page.url().includes("/login")) {
    console.log("✅ Already logged in");
    return;
  }

  console.log("🔑 Logging into Worldpac...");

  // Wait for inputs (robust selectors)
  await page.waitForSelector('input[placeholder="User ID"]', { timeout: 10000 });

  // Fill credentials
  await page.fill('input[placeholder="User ID"]', process.env.WORLDPAC_USERNAME);
  await page.fill('input[placeholder="Password"]', process.env.WORLDPAC_PASSWORD);

  // Click login button
  await page.click('button:has-text("LOGIN")');

  // Wait for navigation away from login
  await page.waitForTimeout(4000);

  // Validate login success
  if (page.url().includes("/login")) {
    throw new Error("❌ Login failed — still on login page");
  }

  console.log("✅ Logged in successfully");
}

async function searchParts({ query, connection_id }) {
  const { page } = await getSession(connection_id);

  // 🔐 ENSURE LOGIN
  await ensureLoggedIn(page);

  console.log("🔍 Searching:", query);

  // TEMP placeholder
  await page.goto("https://example.com");
  await page.waitForTimeout(1000);

  return [
    {
      description: "Brake Pad Set",
      part_number: "BP123",
      price: 89.99,
      brand: "Bosch",
    },
  ];
}

module.exports = { searchParts };