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


    // fallback selector
  const mobileCards = page.locator('.mobile-card.product-quote-mobile');
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

    // Detect layout
    
    const mobileCount = await mobileCards.count();
    const fallbackCount = await fallbackCards.count();

    const isMobileLayout = mobileCount > fallbackCount;
        let parts = [];

    if (isMobileLayout) {
      console.log("📱 Using MOBILE extraction");
      parts = await extractMobile(page);
    } else {
      console.log("🖥️ Using FALLBACK extraction");
      parts = await extractFallback(page);
    }

    console.log("🧾 RAW PARTS:", parts);

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

        }

    async function extractMobile(page) {
      const cards = page.locator('.mobile-card.product-quote-mobile');
      await cards.first().waitFor({ timeout: 15000 });

      const count = await cards.count();
      console.log(`📦 Mobile cards: ${count}`);

      const parts = [];

      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);

        const rows = card.locator(':scope > div');
        const rowCount = await rows.count();

        for (let r = 0; r < rowCount; r++) {
          const row = rows.nth(r);

          try {
            const hasProductId = await row.locator(':scope >> text=Product ID').count();
            const hasMfrId = await row.locator(':scope >> text=MFR ID').count();

            if (!hasProductId || !hasMfrId) continue;

            const lines = row.locator(':scope >> div');
            const lineCount = await lines.count();

            let description = null;
            let part_number = null;
            let normalized_part_number = null;
            let mfr_id = null;

            for (let l = 0; l < lineCount; l++) {
              const text = (await lines.nth(l).textContent())?.trim();
              if (!text) continue;

              if (text.startsWith("Product ID")) {
                const val = text.split(":")[1]?.trim();
                part_number = val;
                if (val) normalized_part_number = val.replace(/\s+/g, '');
              }

              else if (text.startsWith("MFR ID")) {
                mfr_id = text.split(":")[1]?.trim();
              }

              else if (!text.includes("Qty") && !text.includes("$")) {
                if (!description) description = text;
              }
            }

            // price
            let price = null;
            const priceEl = card.locator(':scope >> text=/\\$\\d+\\.\\d+/').first();
            if (await priceEl.count()) {
              const txt = await priceEl.textContent();
              const match = txt?.match(/\$\d+\.\d+/);
              if (match) price = match[0].replace('$', '');
            }

            // availability
            let availability = null;
            const qtyEl = card.locator('text=Qty').first();
            if (await qtyEl.count()) {
              const txt = await qtyEl.textContent();
              const match = txt?.match(/Qty:(\d+)/);
              if (match) availability = match[1];
            }

            // location
            let location = null;
            const locEl = card.locator('text=/\\b(MD|VA|PA)\\b/').first();
            if (await locEl.count()) {
              location = (await locEl.textContent())?.trim();
            }

            // brand
            let brand = null;
            const brandEl = card.locator('.sd-brand-image').first();
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
              availability,
              location,
              brand,
            });

          } catch (err) {
            console.log(`⚠️ Mobile parse error [${i}-${r}]`, err.message);
          }
        }
      }

    return parts;
    } 

    async function extractFallback(page) {
      const cards = page.locator('div:has-text("Product ID"):has-text("$")');
      await cards.first().waitFor({ timeout: 15000 });

      const count = await cards.count();
      console.log(`📦 Fallback cards: ${count}`);

      const parts = [];

      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);

        try {
          const text = await card.textContent();

          console.log("🧾 CARD TEXT:", text);

          if (!text || text.length < 20) continue;

          // 🔥 Split into individual products
          const productChunks = text.split(/(?=Product ID:)/);
          for (const chunk of productChunks) {
            try {
              const partMatch = chunk.match(/^\s*([A-Za-z0-9\-]+)/);
              const mfrMatch = chunk.match(/MFR ID:\s*([A-Za-z0-9\-]+)/);
              const priceMatch = chunk.match(/Price:\$?(\d+\.\d+)/);
              const qtyMatch = chunk.match(/Qty:(\d+)/);
              const locationMatch = chunk.match(/\b(MD|VA|PA)\s+[A-Za-z]+/);

              const part_number = partMatch?.[1] || null;
              const normalized_part_number = part_number?.replace(/\s+/g, '') || null;
              const mfr_id = mfrMatch?.[1] || null;
              const price = priceMatch?.[1] || null;
              const availability = qtyMatch?.[1] || null;
              const location = locationMatch?.[0] || null;

          if (!part_number) continue;

          parts.push({
            description: null,
            part_number,
            normalized_part_number,
            mfr_id,
            price,
            availability,
            location,
            brand: null,
          });

        } catch (err) {
          console.log("⚠️ Chunk parse error:", err.message);
        }
      }

    } catch (err) {
      console.log(`⚠️ Fallback parse error [${i}]`, err.message);
    }
  }

  return parts;
}

module.exports = { searchParts };
