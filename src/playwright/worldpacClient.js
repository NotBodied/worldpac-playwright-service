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

  console.log("⌨️ Pressing ENTER...");
  await passwordInput.press("Enter");

  const submitButton = page.locator('button[type="submit"]');

  console.log("🖱️ Clicking submit button...");
  await submitButton.waitFor({ timeout: 10000 });
  await submitButton.click({ force: true });

  const loginSuccess = await Promise.race([
    page.waitForURL(url => !url.toString().includes("/login"), { timeout: 15000 }).then(() => true).catch(() => false),
    page.locator('input[placeholder*="Search"]').waitFor({ timeout: 15000 }).then(() => true).catch(() => false),
  ]);

  if (!loginSuccess) {
    throw new Error("❌ Login failed — still on login page");
  }

  console.log("✅ Logged in successfully");

  // ⏳ Wait for app to fully render
  console.log("⏳ Waiting for dashboard to load...");
  await page.waitForTimeout(5000);

  // 🧾 Dump real DOM
  const html = await page.content();
  console.log("🧾 AFTER LOGIN HTML START");
  console.log(html.substring(0, 3000));
  console.log("🧾 AFTER LOGIN HTML END");

  console.log("🌐 AFTER LOGIN URL:", page.url());
}

async function searchParts({ query, connection_id }) {
  const { page } = await getSession(connection_id);

  await ensureLoggedIn(page);

  const html = await page.content();
  console.log("🧾 AFTER LOGIN HTML START");
  console.log(html.substring(0, 2000));
  console.log("🧾 AFTER LOGIN HTML END");

  console.log("🌐 AFTER LOGIN URL:", page.url());

  console.log("🔍 Searching:", query);

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