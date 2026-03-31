const { getSession } = require("./sessionManager");

async function ensureLoggedIn(page) {
  console.log("🔐 Checking login state...");

  await page.goto("https://speeddial.worldpac.com/#/login", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  console.log("🌐 Current URL:", page.url());
  console.log("⏳ Waiting for app to render login form...");

  // Step 1: wait for app to hydrate
  await page.waitForSelector('input', { timeout: 20000 });

  // Step 2: wait for actual login field
  await page.waitForSelector('#username', { timeout: 20000 });

  // Step 3: NOW define locators (only once)
  const userInput = page.locator('#username');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button[type="submit"]');

  console.log("🔑 Logging into Worldpac...");

  // BEFORE typing
  await page.waitForTimeout(2000);
  console.log("📸 BEFORE INPUT");
  console.log("🌐 URL:", page.url());

  // TYPE like real user
  await userInput.click();
  await userInput.type(process.env.WORLDPAC_USERNAME, { delay: 50 });

  await passwordInput.click();
  await passwordInput.type(process.env.WORLDPAC_PASSWORD, { delay: 50 });

  // AFTER typing
  await page.waitForTimeout(1000);
  const htmlBeforeSubmit = await page.content();
  console.log("🧾 BEFORE SUBMIT HTML START");
  console.log(htmlBeforeSubmit.substring(0, 2000));
  console.log("🧾 BEFORE SUBMIT HTML END");

  // CLICK submit
  console.log("🖱️ Clicking submit...");
  await submitButton.click();

  // WAIT and OBSERVE (this is key)
  await page.waitForTimeout(5000);

  // AFTER submit
  const htmlAfterSubmit = await page.content();
  console.log("🧾 AFTER SUBMIT HTML START");
  console.log(htmlAfterSubmit.substring(0, 2000));
  console.log("🧾 AFTER SUBMIT HTML END");

  console.log("🌐 AFTER SUBMIT URL:", page.url());
  
}

async function searchParts({ query, connection_id }) {
  const { page } = await getSession(connection_id);

  await ensureLoggedIn(page);

  console.log("🔍 Finding search input...");

  // Wait for ANY input after login
  await page.waitForSelector('input', { timeout: 20000 });

  const inputs = await page.locator('input').all();

  console.log("🧾 INPUT COUNT:", inputs.length);

  // Log all placeholders / names
  for (let i = 0; i < inputs.length; i++) {
    const placeholder = await inputs[i].getAttribute('placeholder');
    const name = await inputs[i].getAttribute('name');
    console.log(`Input ${i}:`, { placeholder, name });
 }

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