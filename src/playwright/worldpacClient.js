const { getSession } = require("./sessionManager");

async function ensureLoggedIn(page) {
  console.log("🔐 Ensuring login state...");

  // 1. Load app (NOT /login)
  await page.goto("https://speeddial.worldpac.com/#/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // 2. Let SPA load
  await page.waitForTimeout(3000);

  // 3. Check if already logged in
  const isLoggedIn = await page.locator('input[name="searchTerm"]')
    .isVisible()
    .catch(() => false);

  if (isLoggedIn) {
    console.log("✅ Already logged in");
    return;
  }

  // 4. Perform login
  console.log("🔑 Logging in...");

  const userInput = page.locator('#username');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button[type="submit"]');

  // Wait for login form
  await userInput.waitFor({ timeout: 15000 });

  // Fill credentials
  await userInput.fill(process.env.WORLDPAC_USERNAME);
  await passwordInput.fill(process.env.WORLDPAC_PASSWORD);

  // Submit
  await submitButton.click();

  // 5. Wait for success signal
  await page.waitForSelector('input[name="searchTerm"]', { timeout: 15000 });

  console.log("✅ Login successful");
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


  console.log("⏳ Waiting for results DOM...");

  // Temporary wait for DOM to fully render (we will replace this later)
  await page.waitForTimeout(5000);

  // 📸 Screenshot AFTER results load
  await page.screenshot({ path: "debug-results.png", fullPage: true });

  // 🌐 Debug URL
  console.log("🌐 AFTER SEARCH URL:", page.url());;

  // 🎯 TARGETED PRODUCT CARD DETECTION
  const productCandidates = await page.evaluate(() => {
    const allDivs = Array.from(document.querySelectorAll("div"));

    return allDivs
      .map(el => ({
        class: el.className,
        text: el.innerText?.slice(0, 200) || ""
      }))
      .filter(el =>
        el.text.includes("Product ID") &&
        el.text.includes("$")
      )
      .slice(0, 20);
  });

console.log("🎯 PRODUCT CANDIDATES:");
console.dir(productCandidates, { depth: null });

  // Wait until page text actually changes
  console.log("⏳ Waiting for results DOM...");

  // Wait for ANY repeating structure (we’ll refine this)
  await page.waitForTimeout(5000);

  // Dump STRUCTURED DOM (not just text)
  const domSnapshot = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll("*"))
      .map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.innerText?.slice(0, 100) || ""
      }))
      .filter(el => el.text.length > 20); // filter noise

    return elements.slice(0, 200); // limit size
  });

  // console.log("🧠 DOM SNAPSHOT:");
  // console.dir(domSnapshot, { depth: null });


  // Small buffer
  await page.waitForTimeout(2000);

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

    try {
      const text = await card.innerText();

      // Extract fields safely using patterns
      const partNumberMatch = text.match(/Product ID:\s*(.+)/);
      const mfrMatch = text.match(/MFR ID:\s*(.+)/);
      const priceMatch = text.match(/\$(\d+(\.\d+)?)/);

      // Description = first line
      const description = text.split("\n")[0]?.trim() || null;

      parts.push({
        description,
        part_number: partNumberMatch?.[1]?.trim() || null,
        brand: mfrMatch?.[1]?.trim() || null,
        price: priceMatch?.[1] || null,
      });

    } catch (err) {
      console.log(`⚠️ Error parsing card ${i}:`, err.message);
    }
  }

  console.log("🧾 DOM PARSED PARTS:", parts);
  console.log("🧾 Parsed parts count:", parts.length);

  return parts;

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
