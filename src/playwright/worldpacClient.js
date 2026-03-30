const { getSession } = require("./sessionManager");

async function ensureLoggedIn(page) {
  console.log("🔐 Checking login state...");

  await page.goto("https://speeddial.worldpac.com/#/login", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  console.log("🌐 Current URL:", page.url());

  const userInput = page.locator('#username');
  const passwordInput = page.locator('input[type="password"]');

  // Wait ONLY for inputs (no button dependency)
  await Promise.all([
    userInput.waitFor({ timeout: 15000 }),
    passwordInput.waitFor({ timeout: 15000 }),
  ]);

  const onLoginPage = await userInput.isVisible().catch(() => false);

  if (!onLoginPage) {
    console.log("✅ Already logged in (no login form)");
    return;
  }

  console.log("🔑 Logging into Worldpac...");

  await userInput.fill(process.env.WORLDPAC_USERNAME);
  await passwordInput.fill(process.env.WORLDPAC_PASSWORD);

  console.log("⌨️ Submitting login with ENTER...");

  // ✅ THIS is the key fix
  await passwordInput.press("Enter");

  // Wait for login success (search bar appearing)
  const loginSuccess = await Promise.race([
    page.locator('input[placeholder*="Search"]').waitFor({ timeout: 15000 }).then(() => true).catch(() => false),
    userInput.waitFor({ timeout: 15000 }).then(() => false).catch(() => false),
  ]);

  if (!loginSuccess) {
    throw new Error("❌ Login failed — still on login page");
  }

  console.log("✅ Logged in successfully");
}

async function searchParts({ query, connection_id }) {
  const { page } = await getSession(connection_id);

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