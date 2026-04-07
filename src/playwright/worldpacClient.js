const { getSession } = require("./sessionManager");

let isSearching = false;


  async function ensureLoggedIn(page) {
    console.log("🔐 Ensuring login state...");

    // 1. Load app (NOT /login)
    const currentUrl = page.url();

  if (!currentUrl.includes("speeddial.worldpac.com")) {
    console.log("🌐 Navigating to Worldpac...");

    await page.goto("https://speeddial.worldpac.com/#/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  } else {
    console.log("♻️ Already on Worldpac, skipping goto");
  }

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

    await userInput.waitFor({ timeout: 6000 });

    await userInput.fill(process.env.WORLDPAC_USERNAME);
    await page.locator('input[type="password"]').fill(process.env.WORLDPAC_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await page.locator('input[name="searchTerm"]').waitFor({ timeout: 6000 });

    console.log("✅ Login successful");

  }
}
async function searchParts({ query, connection_id }) {

  console.log("📥 INCOMING REQUEST:", query, Date.now());

  const startTime = Date.now();

  if (isSearching) {
    console.log("⏳ Already searching — blocked");
    return [];
  }

  isSearching = true;
  console.log("🔒 LOCK ACQUIRED");

  let session;
  let page;

  try {
    // ✅ CREATE SESSION
    session = await getSession(connection_id);
    page = session.page;

    // 💀 Detect dead page
    if (!page || page.isClosed()) {
      console.warn("⚠️ Page is dead — creating new session");
      session = await getSession(connection_id, { forceNew: true });
      page = session.page;
    }

    // 💥 Crash listener
    page.on("crash", () => {
      console.error("💥 PAGE CRASH EVENT DETECTED");
    });

    console.log("🚀 searchParts START");

    // ✅ LOGIN (WITH RETRY)
    try {
      await ensureLoggedIn(page);
    } catch (err) {
      console.warn("⚠️ ensureLoggedIn failed — recreating session");

      session = await getSession(connection_id, { forceNew: true });
      page = session.page;

      await ensureLoggedIn(page);
    }

    console.log("✅ Login complete");

    console.log("🔍 Performing search...");

    // 🧠 SPA STABILIZE
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[name="searchTerm"]');

    await searchInput.waitFor({ timeout: 6000 });
    await searchInput.fill('');
    await searchInput.type(query, { delay: 50 });
    await searchInput.press("Enter");

    // ⏱️ START TIMER HERE (NOT AT FUNCTION START)
    const searchStartTime = Date.now();

    //if (Date.now() - searchStartTime > 10000) {
    //  console.warn("⏳ Timeout safeguard hit before results load");
    //  return [];
    //}

    console.log("⏳ Waiting for product cards...");

    const mobileCards = page.locator('.mobile-card.product-quote-mobile');
    const fallbackCards = page.locator('div').filter({
      has: page.locator('text=Product ID'),
    }).filter({
      has: page.locator('text=Price'),
    });

    let resultsLoaded = false;

    try {
      await mobileCards.first().waitFor({ timeout: 8000 });
      resultsLoaded = true;
      console.log("📱 Mobile results detected");

      console.log("⏳ Waiting for full results to render...");

      let previousCount = 0;
      let stableCount = 0;

      for (let i = 0; i < 10; i++) {
        const currentCount = await mobileCards.count();

        console.log(`📊 Render check ${i}: ${currentCount} cards`);

        if (currentCount === previousCount) {
          stableCount++;
        } else {
          stableCount = 0;
        }

        if (stableCount >= 2) {
          console.log("✅ Results fully loaded");
          break;
        }

        previousCount = currentCount;

        await page.waitForTimeout(500);
      }

    } catch {}

    if (!resultsLoaded) {
      try {
        await fallbackCards.first().waitFor({ timeout: 8000 });
        resultsLoaded = true;
        console.log("🖥️ Fallback results detected");
      } catch {}
    }

    if (!resultsLoaded) {
      console.warn("⚠️ No results detected after waiting");
      return [];
    }

    await page.screenshot({ path: "debug-results.png", fullPage: true });

    if (Date.now() - searchStartTime > 12000) {
      console.warn("⏳ Timeout safeguard hit before extraction");
      return [];
    }

    console.log("🧠 Extracting via DOM...");

    const mobileCount = await mobileCards.count();
    const fallbackCount = await fallbackCards.count();

    console.log("📊 Mobile count:", await mobileCards.count());
    console.log("📊 Fallback count:", await fallbackCards.count());

    const isMobileLayout = true;

    let parts = [];

    try {
      if (isMobileLayout) {
        console.log("📱 Using MOBILE extraction");
        parts = await extractMobile(page, searchStartTime);
      } else {
        console.log("🖥️ Using FALLBACK extraction");
        parts = await extractFallback(page);
      }
    } catch (err) {
      console.warn("⚠️ Extraction failed:", err.message);
      parts = [];
    }

    console.log("🧾 RAW PARTS:", parts);

    const uniqueParts = [];
    const seen = new Set();

    for (const p of parts) {
      const key = `${p.part_number}-${p.price}-${p.location}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueParts.push(p);
      }
    }

    return uniqueParts;

  } catch (err) {
    console.error("❌ searchParts crashed:", err.message);
    return [];
  } finally {
    isSearching = false;
    console.log("🔓 LOCK RELEASED");
  }
}

    async function extractMobile(page, searchStartTime) {
      const cards = page.locator('.mobile-card.product-quote-mobile');
      await cards.first().waitFor({ timeout: 6000 });

      const totalCount = await cards.count();

      // 🔥 LIMIT RESULTS (VERY IMPORTANT)
      const count = Math.min(totalCount, 15);

      console.log(`📦 Mobile cards (limited): ${count} / ${totalCount}`);


      console.log("🔍 FIRST 5 CARD TEXTS FOR DEBUG:");

      for (let i = 0; i < Math.min(5, count); i++) {
        const txt = await cards.nth(i).textContent();
        console.log(`CARD ${i}:`, txt?.slice(0, 200));
      }


      //console.log(`📦 Mobile cards: ${count}`);

      const parts = [];

      for (let i = 0; i < count; i++) {
        

      // ⏱️ GLOBAL TIME SAFETY
      if (Date.now() - searchStartTime > 12000) {
        console.warn("⏳ Stopping extraction early (timeout safety)");
        break;
      }

      // 🔥 LIMIT RESULTS
      if (parts.length >= 10) break;

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

            const brandEl = row.locator('img[alt]');
            if (await brandEl.count()) {
              const alt = await brandEl.first().getAttribute('alt');

              if (
                alt &&
                alt !== 'name' &&
                !alt.toLowerCase().includes('image')
              ) {
                brand = alt;
              }
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
      const rows = page.locator('div:has-text("Product ID") >> xpath=..');

      await rows.first().waitFor({ timeout: 6000 });

      const count = await rows.count();
      console.log(`📦 Product rows: ${count}`);

      // 🔥 LIMIT TO FIRST 10 ROWS
      const limit = Math.min(count, 10);

      const parts = [];

      for (let i = 0; i < limit; i++) {
        const row = rows.nth(i);

        try {
          const rowText = await row.textContent();
          if (!rowText) continue;
          if (rowText.length > 500) continue;

          if (
            !rowText.includes("Product ID") ||
            //!rowText.includes("MFR ID") ||
            !rowText.includes("Price") //||
            //!rowText.includes("Qty")
          ) continue;

          console.log("✅ Row passed filter");
          console.log("🔎 ROW TEXT:", rowText.slice(0, 200));
          
          // --- FIELD EXTRACTION ---

          const productIdMatch = rowText.match(/Product ID:\s*([A-Za-z0-9\- ]+?)\s+MFR ID/);
          const priceMatch = rowText.match(/Price:\$?(\d+(\.\d+)?)/i);
          const qtyMatch = rowText.match(/Qty:(\d+)/);
          const locationMatch = rowText.match(/Qty:\d+\s+((?:Special Order\s+)?[A-Z]{2}\s+[A-Za-z ]+)/);

          const part_number = productIdMatch?.[1]?.trim() || null;

          let normalized_part_number = part_number
            ? part_number.replace(/[^A-Za-z0-9\-]/g, '')
            : null;

            // ✅ DEFINE mfrEl (THIS IS WHAT YOU'RE MISSING)
          let mfr_id = null;
          const mfrEl = row.locator('text=MFR ID').first();

          if (await mfrEl.count()) {
              const mfrText = await mfrEl.textContent();
              const match = mfrText?.match(/MFR ID:\s*([A-Za-z0-9\-]+)/);
              if (match) {
                mfr_id = match[1].trim();
              }
            }


            if (!mfr_id) {
              mfr_id = part_number;
            }

        const price = priceMatch ? Number(priceMatch[1]) : null;
          const availability = qtyMatch ? Number(qtyMatch[1]) : null;

          let location = null;

          if (locationMatch) {
            location = locationMatch[1]
              .replace(/Submit.*$/i, '')   // ← remove "Submit by..."
              .trim();
          }

          if (!part_number || part_number.length < 3) continue;

          // ✅ Description
          let description = null;

          const descMatch = rowText.match(/^(.*?)Product ID:/);

          if (descMatch) {
            description = descMatch[1]
              .replace(/\s+/g, ' ')
              .trim();
          }

          // ✅ Brand
          let brand = null;

          const brandEl = row.locator('img[alt]');
          if (await brandEl.count()) {
            const alt = await brandEl.first().getAttribute('alt');

            if (
              alt &&
              alt !== 'name' &&
              !alt.toLowerCase().includes('image')
            ) {
              brand = alt;
            }
          }

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
          console.log(`⚠️ Row parse error [${i}]`, err.message);
        }
      }

  return parts;
}

module.exports = { searchParts };
