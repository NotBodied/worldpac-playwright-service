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

  console.log("⏳ Waiting for product cards (multi-layout)...");

  const mobileCards = page.locator('.mobile-card.product-quote-mobile');

    // fallback selector
  const fallbackCards = page.locator('div:has-text("Product ID")');

  await Promise.race([
    mobileCards.first().waitFor({ timeout: 15000 }).catch(() => {}),
    fallbackCards.first().waitFor({ timeout: 15000 }).catch(() => {})
  ]);

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
  let productCards = page.locator('.mobile-card.product-quote-mobile');

  if (await productCards.count() === 0) {
    console.log("⚠️ Mobile layout not found, using fallback...");
    productCards = page.locator('div:has-text("Product ID")');
  }

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

      // ✅ Description (clean)
      const description = text.split("\n")[0]?.trim() || null;

      // ✅ Part Number
      const partEl = await card.locator('text=Product ID').first();
      let part_number = null;
      if (await partEl.count()) {
        const partText = await partEl.innerText();
        part_number = partText.split(':')[1]?.trim() || null;
      }

      // ✅ MFR ID
      const mfrEl = await card.locator('text=MFR ID').first();
      let mfr_id = null;
      if (await mfrEl.count()) {
       const mfrText = await mfrEl.innerText();
       mfr_id = mfrText.split(':')[1]?.trim() || null;
      }

      // ✅ Price
      const priceEl = await card.locator('text=$').first();
      let price = null;
      if (await priceEl.count()) {
       const priceText = await priceEl.innerText();
       price = priceText.replace('$', '').trim();
      }

      // ✅ Availability (temporary regex)
      const availabilityMatch = text.match(/Qty:(\d+)/);

      // ✅ Location (temporary)
      const locationLine = text
       .split("\n")
       .find(line => line.includes("MD") || line.includes("VA") || line.includes("PA"));

      const location = locationLine ? locationLine.trim() : null;

      parts.push({
        description,
        part_number,
        mfr_id,
        price,
        availability: availabilityMatch?.[1] || null,
        location,
        brand,
      });} catch (err) {
          console.log(`⚠️ Error parsing card ${i}:`, err.message);
    }
  }

  console.log("🧾 DOM PARSED PARTS:", parts);
  console.log("🧾 Parsed parts count:", parts.length);

  return parts;

 
}

module.exports = { searchParts };
