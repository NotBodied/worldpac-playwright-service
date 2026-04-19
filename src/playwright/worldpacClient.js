const { getSession } = require("./sessionManager");

const searchQueues = new Map();

  async function enqueueSearch(connection_id, task) {
  const prev = searchQueues.get(connection_id) || Promise.resolve();

  let resolveNext;
  const next = new Promise(res => (resolveNext = res));

  searchQueues.set(connection_id, prev.then(() => next));

  try {
    return await task();
  } finally {
    resolveNext();

    if (searchQueues.get(connection_id) === next) {
      searchQueues.delete(connection_id);
    }
  }
}

  async function ensureLoggedIn(page, credentials) {
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

    if (!credentials?.username || !credentials?.password) {
      throw new Error("❌ Missing Worldpac credentials");
    }

    await userInput.fill(credentials.username);
    await page.locator('input[type="password"]').fill(credentials.password);
    await page.locator('button[type="submit"]').click();

    try {
      await page.locator('input[name="searchTerm"]').waitFor({ timeout: 6000 });
    } catch (err) {
      console.error("❌ Login failed — invalid credentials?");
      throw new Error("INVALID_SUPPLIER_CREDENTIALS");
    }
    await page.waitForTimeout(500); // 👈 ADD THIS

    console.log("✅ Login successful");

  }
}
async function searchParts({ 
  query, 
  connection_id, 
  vehicle = null,
  selected_category_index = null,
  credentials = null
}) {
  return enqueueSearch(connection_id, async () => {

  console.log("📥 INCOMING REQUEST:", query, Date.now());
  console.log("🚗 Incoming vehicle:", vehicle);

  

 
  console.log("🔒 LOCK ACQUIRED");

  let session;
  let page;

  try {
    // ✅ CREATE SESSION
    session = await getSession(connection_id, {
      forceNew: !!credentials
    });
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
      await ensureLoggedIn(page, credentials);
    } catch (err) {
      console.warn("⚠️ ensureLoggedIn failed — recreating session");

      session = await getSession(connection_id, { forceNew: true });
      page = session.page;

      await ensureLoggedIn(page, credentials);
    }

    await ensureVehicleSet(page, vehicle);
    // --- END VEHICLE DEBUG ---

    console.log("✅ Login complete");

    await page.waitForTimeout(1500);

    console.log("🔍 Performing search...");

    // 🧠 SPA STABILIZE
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[name="searchTerm"]');

    await searchInput.waitFor({ timeout: 6000 });
    await searchInput.fill('');
    await searchInput.type(query, { delay: 50 });
    await searchInput.press("Enter");

    await page.waitForTimeout(1000);

    const categories = await detectPartCategories(page);

    if (categories && categories.length > 0) {

      if (selected_category_index != null) {
        console.log("🎯 Applying selected category:", selected_category_index);

    const nodeCount = await page.locator('.sd-part-node').count();

    if (selected_category_index >= nodeCount) {
      console.warn("⚠️ Invalid category index");
      return [];
    }

    const node = page.locator('.sd-part-node').nth(selected_category_index);
        const clickable = node.locator('.sd-part-node-desc-text');

        await clickable.click();

        await page.waitForTimeout(1500);

        const priceButton = page.locator('#price-button');

        if (await priceButton.count()) {
          await priceButton.waitFor({ state: 'visible', timeout: 5000 });
          await priceButton.click();
        }

        await page.waitForTimeout(3000);

        const cards = page.locator('.mobile-card.product-quote-mobile');

        if (!(await cards.count())) {
          console.warn("⚠️ Category selection failed to load results");
          return [];
        }

      } else {
        console.log("📂 Returning category options instead of auto-select");

        return {
          type: "category_selection",
          categories
        };
      }
    }

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

    //if (Date.now() - searchStartTime > 12000) {
     // console.warn("⏳ Timeout safeguard hit before extraction");
     // return [];
   // }

    // 🔥 WAIT FOR IMAGE QUEUE TO FILL
    
      
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
  }

  });
  }

    async function extractMobile(page, searchStartTime) {
      const cards = page.locator('.mobile-card.product-quote-mobile');
      await cards.first().waitFor({ timeout: 6000 });

      const totalCount = await cards.count();

      // 🔥 LIMIT RESULTS (VERY IMPORTANT)
      const count = Math.min(totalCount, 40);

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
      if (Date.now() - searchStartTime > 30000) {
        console.warn("⏳ Soft timeout hit, stopping extraction");
        break;
      }

      // 🔥 LIMIT RESULTS
      // TEMP: no hard limit
      // if (parts.length >= 20) break;

        const card = cards.nth(i);

        // 🔍 DEBUG IMAGE HTML (TEMP)
        if (i === 0) {
          const html = await card.innerHTML();
          console.log("🖼 CARD HTML:", html.slice(0, 1000));
        }

        const rows = card.locator(':scope > div');
        const rowCount = await rows.count();

      let added = false;

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
                if (!description) {
                  let clean = text;

                  // 🔥 CUT OFF AT "Product ID"
                  if (clean.includes("Product ID")) {
                    clean = clean.split("Product ID")[0];
                  }

                  description = clean.trim();
                }
              }
            }

            if (!mfr_id) mfr_id = part_number;

            const priceText = await card.textContent();

          // get ALL prices
          const matches = [...(priceText?.matchAll(/\$(\d+\.\d+)/g) || [])]
            .map(m => parseFloat(m[1]));

          let price = null;
          let list_price = null;
          let core_charge = null;

          if (matches.length === 1) {
            price = matches[0];
          }

          else if (matches.length === 2) {
            matches.sort((a, b) => a - b);
            price = matches[0];
            list_price = matches[1];
          }

          else if (matches.length >= 3) {
            matches.sort((a, b) => a - b);
            core_charge = matches[0];       // 🔥 core
            price = matches[1];             // actual cost
            list_price = matches[matches.length - 1]; // retail
          }
              
            const qtyMatch = await card.textContent();
            const availability = qtyMatch?.match(/Qty:(\d+)/)?.[1] || null;

            const locationMatch = qtyMatch?.match(/Qty:\d+\s+((?:Special Order\s+)?[A-Z]{2}\s+[A-Za-z ]+)/);
            let location = locationMatch?.[1]?.replace(/Submit.*$/i, '').trim() || null;
            
            // 🔍 DEBUG IMAGE QUEUE (ONLY RUN ON FIRST ITEM)
            

            
            // 🔥 TARGET REAL PART IMAGE ONLY
            let image_url = null;

            const partImage = card.locator('img.sd-part-image');

            if (await partImage.count()) {
              let src = await partImage.first().getAttribute('src');

              if (!src) {
                src = await partImage.first().getAttribute('data-src');
              }

              if (src && src.includes('asset=')) {
                image_url = src;
              }
            }

            let brand = null;
            const brandEl = row.locator('img[alt]:not(.sd-part-image)');
            if (await brandEl.count()) {
              const alt = await brandEl.first().getAttribute('alt');
              if (alt && alt !== 'name' && !alt.toLowerCase().includes('image')) {
                brand = alt;
              }
            }
            
            // 🔥 ATTRIBUTES EXTRACTION (ADD THIS BLOCK)
            let attributes = [];

            let attrNodes = row.locator('.product-attribute');
            let attrCount = await attrNodes.count();

            if (attrCount === 0) {
              attrNodes = card.locator('.product-attribute');
              attrCount = await attrNodes.count();
            }
            
            for (let a = 0; a < attrCount; a++) {
              const attr = attrNodes.nth(a);

              const text = (await attr.textContent())?.trim();

              if (text) {
                attributes.push(text.replace(/\s+/g, ' '));
              }
            }

           if (i === 0) {
            console.log("🧪 ATTRIBUTES FOUND:", attributes);
           } 

            if (!part_number || added) continue;

            parts.push({
              description,
              part_number,
              normalized_part_number,
              mfr_id,
              price,
              list_price,
              core_charge,
              availability,
              location,
              brand,
              image_url,
              attributes,
            });

            added = true;

          } catch (err) {
            console.log(`⚠️ Mobile parse error [${i}-${r}]`, err.message);
          }
        }
      }

    console.log(`✅ Returning ${parts.length} parts`);

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
            core_charge,
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

async function ensureVehicleSet(page, vehicle) {
  if (!vehicle) {
    console.log('🚗 No vehicle provided, skipping selection');
    return;
  }

  console.log('🚗 Ensuring vehicle is set:', vehicle);

  const { openVehicleSelector } = require('./utils/vehicleDebug');

  await openVehicleSelector(page);

  if (vehicle.vin) {
    console.log('🚗 Using VIN path');

    try {
      const vinInput = page.locator('#vin');

      await vinInput.waitFor({ state: 'visible', timeout: 10000 });

      // Clear first (important for repeat runs)
      await vinInput.fill('');
      await vinInput.type(vehicle.vin, { delay: 20 });

      // 🔥 Submit form via Enter (ONLY method we use now)
      await vinInput.press('Enter');

      console.log('⏳ Waiting for VIN to resolve...');

      // Give UI time to process VIN
      await page.waitForTimeout(2000);

      // 🔥 Handle possible "Continue" modal
      const continueButton = page.locator('button:has-text("Continue")');

      if (await continueButton.count()) {
        console.log('👉 Clicking Continue on vehicle modal');
        await continueButton.first().click();
        await page.waitForTimeout(2000);
      }

      // Final stabilization before search
      await page.waitForTimeout(1000);

    } catch (err) {
      console.log('❌ VIN entry failed:', err.message);
    }
  }
}

async function detectPartCategories(page) {
  const nodes = page.locator('.sd-part-node');
  const count = await nodes.count();

  if (count === 0) return null;

  const categories = [];

  for (let i = 0; i < count; i++) {
    const node = nodes.nth(i);

    const text = await node.locator('.sd-part-node-desc-text').innerText();

    categories.push({
      index: i,
      label: text.trim()
    });
  }

  return categories;
}

  

module.exports = { searchParts };
