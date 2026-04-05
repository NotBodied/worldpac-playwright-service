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
  const fallbackCards = page.locator('div:has-text("Product ID"):has-text("$")');

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
  const isMobileLayout = await page.locator('.mobile-card.product-quote-mobile').count() > 0;
  let productCards = page.locator('.mobile-card.product-quote-mobile');

  if (await productCards.count() === 0) {
    console.log("⚠️ Mobile layout not found, using fallback...");
    productCards = page.locator('div:has-text("Product ID"):has-text("$")');
  }

  // Wait for at least one card (REAL wait condition now)
  await productCards.first().waitFor({ timeout: 15000 });

  const count = await productCards.count();
  console.log(`📦 Found ${count} product cards`);

  const parts = [];

  for (let i = 0; i < count; i++) {
  const card = productCards.nth(i);

  try {
    const text = await card.innerText();

    // Split into individual products
     // 🔍 Find rows inside the card
    const rows = card.locator('div').filter({
      hasText: 'Product ID'
    });

    const rowCount = await rows.count();

    for (let r = 0; r < rowCount; r++) {
     const row = rows.nth(r);

    if (!rowText.includes("Product ID") || !rowText.includes("MFR ID")) {
      continue;
    }

     // ✅ Description (first line ABOVE Product ID)
    let description = rowText
      .split("\n")
     .find(line =>
        !line.includes("Product ID") &&
        !line.includes("MFR ID") &&
        !line.includes("Qty") &&
        !line.includes("$")
     )?.trim() || null;

     // ✅ Part Number
      let part_number = null;
     let normalized_part_number = null;

     const partLine = rowText.split("\n").find(l => l.includes("Product ID"));
     if (partLine) {
        const raw = partLine.split(":")[1]?.trim();
        part_number = raw;
        if (raw) normalized_part_number = raw.replace(/\s+/g, '');
      }

       // ✅ MFR
      let mfr_id = null;
      const mfrLine = rowText.split("\n").find(l => l.includes("MFR ID"));
     if (mfrLine) {
        mfr_id = mfrLine.split(":")[1]?.trim();
     }

     // ✅ Price (scoped to row, not card)
    let price = null;
    const priceMatch = rowText.match(/\$\d+\.\d+/);
    if (priceMatch) {
      price = priceMatch[0].replace('$', '');
    }

      // ✅ Availability
     const availabilityMatch = rowText.match(/Qty:(\d+)/);

      // ✅ Location
     const locationLine = rowText
       .split("\n")
       .find(line => line.includes("MD") || line.includes("VA") || line.includes("PA"));

     const location = locationLine ? locationLine.trim() : null;

     // ✅ Brand (still from card)
      const brandEl = await card.locator('.sd-brand-image').first();
     let brand = null;
     if (await brandEl.count()) {
       brand = await brandEl.getAttribute('alt');
     }

      if (!part_number) continue;

      parts.push({
       description,
       part_number,
       normalized_part_number,
        mfr_id,
        price,
        availability: availabilityMatch?.[1] || null,
       location,
        brand,
      });
    }

  } catch (err) {
    console.log(`⚠️ Error parsing card ${i}:`, err.message);
  }
}

  console.log("🧾 DOM PARSED PARTS:", parts);
  console.log("🧾 Parsed parts count:", parts.length);

  const uniqueParts = [];
  const seen = new Set();

  for (const p of parts) {
   const key = `${p.part_number}-${p.description}`;
   if (!seen.has(key)) {
     seen.add(key);
     uniqueParts.push(p);
   }
  }

  return uniqueParts;

  return parts;

 
}

module.exports = { searchParts };
