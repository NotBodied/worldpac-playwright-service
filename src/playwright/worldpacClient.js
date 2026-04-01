const { getSession } = require("./sessionManager");

async function ensureLoggedIn(page) {
  console.log("🔐 Checking login state...");

  // STEP 1: Always load app entry point
  await page.goto("https://speeddial.worldpac.com/#", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // 👇 STEP 2: small wait (let SPA load)
  await page.waitForSelector('body', { timeout: 10000 });

  // STEP 1: Always load app entry point
  console.log("🔍 Checking if already logged in...");

  const isLoggedIn = await page.locator('input[name="searchTerm"]')
    .isVisible()
    .catch(() => false);

  if (isLoggedIn) {
    console.log("✅ Already logged in — skipping login");
    return;
  }
 
  // STEP 4: Only now attempt login
  console.log("🔑 Not logged in — performing login...");
  

  // 👇 STEP 2: HTML dump
  const html = await page.content();
  console.log("🧾 LOGIN PAGE HTML START");
  console.log(html.substring(0, 2000));
  console.log("🧾 LOGIN PAGE HTML END");

  // 👇 STEP 3: visible text
  const visibleText = await page.evaluate(() => document.body.innerText);
  console.log("🧾 LOGIN PAGE TEXT START");
  console.log(visibleText.substring(0, 1000));
  console.log("🧾 LOGIN PAGE TEXT END");

  // 👇 STEP 4: enumerate inputs (THIS is what you asked about)
  const inputs = await page.locator('input').all();

  console.log("🧾 LOGIN INPUT COUNT:", inputs.length);

  for (let i = 0; i < inputs.length; i++) {
    const placeholder = await inputs[i].getAttribute('placeholder');
    const name = await inputs[i].getAttribute('name');
    console.log(`Login Input ${i}:`, { placeholder, name });
  }

  // Step: 5 - check if we're already logged in (crude check for demo)
  
  console.log("🌐 Current URL:", page.url());
  console.log("⏳ Waiting for app to render login form...");

  // Step 1: wait for app to hydrate
  await page.waitForSelector('input', { timeout: 20000 });

  // Step 2: wait for actual login field
 //   await page.waitForSelector('#username', { timeout: 20000 });

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

  console.log("🚀 searchParts START");

  console.log("🔍 About to ensure login...");
  await ensureLoggedIn(page);
  console.log("✅ Login complete");

  console.log("🔍 About to search...");

  console.log("🔍 Performing search...");

  const searchInput = page.locator('input[name="searchTerm"]');

  // Wait for it to be usable
  await searchInput.waitFor({ timeout: 15000 });

  // Clear anything in it
  await searchInput.fill('');

  // Type query like real user
 //   await searchInput.type(query, { delay: 50 });
  await searchInput.type("wiper", { delay: 50 });

  // Submit search
  await searchInput.press("Enter");

  console.log("🔍 Waiting for results container...");

  // Wait for results to load
  console.log("⏳ Waiting for results (text-based)...");

  // Wait until page text actually changes
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text && text.length > 1000; // crude but effective
  }, { timeout: 20000 });

  // Small buffer
  await page.waitForTimeout(2000);

  const html = await page.content();
   console.log("🧾 SEARCH RESULTS HTML START");
   console.log(html.substring(0, 2000));
   console.log("🧾 SEARCH RESULTS HTML END");

  const visibleText = await page.evaluate(() => document.body.innerText);
   console.log("🧾 PAGE TEXT START");
   console.log(visibleText.substring(0, 2000));
   console.log("🧾 PAGE TEXT END");

   

   console.log("🌐 AFTER SEARCH URL:", page.url());

   console.log("🔍 Searching:", query);

   //   return [{ debug: "search executed" }];

     const lines = visibleText
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const parts = [];

  let currentPart = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 🧠 Start a new part when we see Product ID
    if (line.startsWith("Product ID:")) {
      // Push previous part
      if (currentPart) parts.push(currentPart);

      currentPart = {
        description: null,
        part_number: line.replace("Product ID:", "").trim(),
        brand: null,
        price: null,
      };

      // Try to grab description ABOVE (usually correct)
      if (i > 0) {
        currentPart.description = lines[i - 1];
      }
    }

    // MFR ID (sometimes useful)
    if (line.startsWith("MFR ID:") && currentPart) {
      currentPart.brand = line.replace("MFR ID:", "").trim();
    }

    // Price handling (robust)
    if (line === "Price:" && currentPart) {
     const nextLine = lines[i + 1];
     if (nextLine && nextLine.includes("$")) {
        currentPart.price = nextLine.replace("$", "").trim();
      }
    }

    // Alternative price format (sometimes inline)
    if (line.includes("$") && currentPart && !currentPart.price) {
      const priceMatch = line.match(/\$\d+(\.\d+)?/);
      if (priceMatch) {
        currentPart.price = priceMatch[0].replace("$", "");
      }
    }
  }

  // Push last part
  if (currentPart) parts.push(currentPart);

  // 🧹 Cleanup invalid entries
  const cleanedParts = parts.filter(p =>
    p.part_number || p.description
  ); 

  console.log("🧾 PARSED PARTS:", cleanedParts);
  console.log("🧾 Parsed parts count:", cleanedParts.length);
  
  return cleanedParts || [];


}

module.exports = { searchParts };
