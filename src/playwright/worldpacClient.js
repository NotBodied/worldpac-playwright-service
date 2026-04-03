const { getSession } = require("./sessionManager");

async function ensureLoggedIn(page) {
  console.log("🔐 Ensuring login state...");

  // 1. Load app (NOT /login)
  await page.goto("https://speeddial.worldpac.com/#/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // 2. Let SPA load
  // Wait for either login OR search input
  await Promise.race([
    page.locator('input[name="searchTerm"]').waitFor({ timeout: 10000 }).catch(() => {}),
    page.locator('#username').waitFor({ timeout: 10000 }).catch(() => {})
  ]);

  // 3. Check if already logged in
  const isLoggedIn = await page.locator('input[name="searchTerm"]').count() > 0;

  if (!isLoggedIn) {
    console.log("🔑 Logging in...");

    const userInput = page.locator('#username');

    await userInput.waitFor({ timeout: 15000 });

    await userInput.fill(process.env.WORLDPAC_USERNAME);
    await page.locator('input[type="password"]').fill(process.env.WORLDPAC_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await page.locator('input[name="searchTerm"]').waitFor({ timeout: 15000 });

    console.log("✅ Login successful");

  }
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
  await searchInput.type(query, { delay: 50 });

  // Submit search
  await searchInput.press("Enter");

  console.log("⏳ Waiting for product cards...");

  await page.locator('.mobile-card.product-quote-mobile').first().waitFor({
    timeout: 20000
  });

  // console.log("⏳ Waiting for results DOM...");

  // Temporary wait for DOM to fully render (we will replace this later)
  // await page.waitForTimeout(5000);

  // 📸 Screenshot AFTER results load
  await page.screenshot({ path: "debug-results.png", fullPage: true });

  // 🌐 Debug URL
  //console.log("🌐 AFTER SEARCH URL:", page.url());;



  // Wait for ANY repeating structure (we’ll refine this)
  // await page.waitForTimeout(5000);


  // console.log("🧠 DOM SNAPSHOT:");
  // console.dir(domSnapshot, { depth: null });


  // Small buffer
  //await page.waitForTimeout(2000);

  console.log("🧠 Extracting via DOM...");

  // 🎯 Locate product cards
  const productCards = page.locator('.mobile-card.product-quote-mobile');

  // Wait for at least one card (REAL wait condition now)
  await productCards.first().waitFor({ timeout: 15000 });

  const count = await productCards.count();
  console.log(`📦 Found ${count} product cards`);

  const parts = [];

  for (let i = 0; i < count; i++) {
    const card = productCards.nth(i);

  // identify child elements (debug)
  //const html = await card.innerHTML();
  //console.log(`🧩 CARD ${i} HTML:`, html.slice(0, 500));  

  const brandEl = await card.locator('.sd-brand-image').first();

  let brand = null;

  if (await brandEl.count()) {
    brand = await brandEl.getAttribute('alt');
  }

    try {
      const text = await card.innerText();

      // Extract fields safely using patterns
      const partNumberMatch = text.match(/Product ID:\s*(.+)/);
      const mfrMatch = text.match(/MFR ID:\s*(.+)/);
      const priceMatch = text.match(/\$(\d+(\.\d+)?)/);
      
      // ✅ NEW
      const availabilityMatch = text.match(/Qty:(\d+)/);
      const locationLine = text
        .split("\n")
        .find(line => line.includes("MD") || line.includes("VA") || line.includes("PA"));

      const location = locationLine ? locationLine.trim() : null;
      // Description = first line
      const description = text.split("\n")[0]?.trim() || null;

      parts.push({
        description, 
        part_number: partNumberMatch?.[1]?.trim() || null,
        mfr_id: mfrMatch?.[1]?.trim() || null,
        price: priceMatch?.[1] || null,

        // ✅ NEW FIELDS
        availability: availabilityMatch?.[1] || null,
        location,

        brand, // ✅ NEW (real brand, not fake)
      });

    } catch (err) {
      console.log(`⚠️ Error parsing card ${i}:`, err.message);
    }
  }

  console.log("🧾 DOM PARSED PARTS:", parts);
  console.log("🧾 Parsed parts count:", parts.length);

  return parts;

 
}

module.exports = { searchParts };
