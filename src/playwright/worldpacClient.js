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
    const lines = text.split("\n");

    // Detect description lines (start of product)
    const productChunks = [];
    let currentChunk = [];

    for (const line of lines) {
      const isDescriptionLine =
        !line.includes("Product ID") &&
        !line.includes("MFR ID") &&
        !line.includes("Qty") &&
        !line.includes("$") &&
        line.trim().length > 5;

      if (isDescriptionLine && currentChunk.length > 0) {
        productChunks.push(currentChunk.join("\n"));
       currentChunk = [];
     }

      currentChunk.push(line);
    }

    if (currentChunk.length > 0) {
      productChunks.push(currentChunk.join("\n"));
    }

    for (const chunk of productChunks) {

      // ✅ Brand (still from card)
      const brandEl = await card.locator('.sd-brand-image').first();
     let brand = null;
      if (await brandEl.count()) {
        brand = await brandEl.getAttribute('alt');
      }

    let description = chunk.split("\n")[0]?.trim() || null;
      

     let part_number = null;
     let normalized_part_number = null;
     let mfr_id = null;
      let price = null;

      // ✅ Part Number
     const partLine = chunk.split("\n").find(line => line.includes("Product ID"));
     if (partLine) {
        const raw_part_number = partLine.split(':')[1]?.trim() || null;
       part_number = raw_part_number;

       if (raw_part_number) {
         normalized_part_number = raw_part_number.replace(/\s+/g, '');
       }
     }

      // ✅ MFR ID
     const mfrLine = chunk.split("\n").find(line => line.includes("MFR ID"));
     if (mfrLine) {
       mfr_id = mfrLine.split(':')[1]?.trim() || null;
      }

     // ✅ Price (still DOM-based)
     const priceEl = await card.locator('text=$').first();
     if (await priceEl.count()) {
       const priceText = await priceEl.innerText();
       price = priceText.replace('$', '').trim();
      }

      // ✅ Availability
      const availabilityMatch = chunk.match(/Qty:(\d+)/);

      // ✅ Location
     const locationLine = chunk
       .split("\n")
       .find(line => line.includes("MD") || line.includes("VA") || line.includes("PA"));

     const location = locationLine ? locationLine.trim() : null;

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

  return parts;

 
}

module.exports = { searchParts };
