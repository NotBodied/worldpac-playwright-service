const { getSession } = require("./sessionManager");

async function ensureLoggedIn(page) {
  console.log("🔐 Checking login state...");

  await page.goto("https://speeddial.worldpac.com/#/login", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // Wait for either login form OR logged-in state
  await Promise.race([
    page.locator('#username').waitFor({ timeout: 15000 }),
    page.locator('text=Logout').waitFor({ timeout: 15000 }).catch(() => {})
  ]);

  // If already logged in
  if (!page.url().includes("/login")) {
    console.log("✅ Already logged in");
    return;
  }

  console.log("🔑 Logging into Worldpac...");

  const userInput = page.locator('#username');
  const passwordInput = page.locator('input[type="password"]');

  // Retry-safe wait
  await userInput.waitFor({ timeout: 15000 });

  await userInput.fill(process.env.WORLDPAC_USERNAME);
  await passwordInput.fill(process.env.WORLDPAC_PASSWORD);

  const loginButton = page.locator('.login-form-submit-button');

  await loginButton.waitFor({ state: "visible", timeout: 15000 });

  console.log("👉 Attempting to click login button...");

  await page.waitForTimeout(500);
  await loginButton.click({ force: true });

  // Wait for either success OR failure
  await Promise.race([
    page.waitForURL(url => !url.includes("/login"), { timeout: 15000 }),
    page.locator('#username').waitFor({ timeout: 15000 }).catch(() => {})
  ]);

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