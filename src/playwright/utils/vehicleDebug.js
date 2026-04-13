async function logVehicleState(page) {
  console.log("[Vehicle] Checking current vehicle state...");

  // Dump possible vehicle display areas
  const candidates = await page.$$eval("body *", nodes => {
    return nodes
      .filter(n => {
        const text = n.innerText || "";
        return (
          text.match(/\b(19|20)\d{2}\b/) && // year
          text.length < 120 // avoid huge blocks
        );
      })
      .slice(0, 10)
      .map(n => ({
        text: n.innerText.trim(),
        class: n.className,
        tag: n.tagName
      }));
  });

  console.log("[Vehicle] Possible vehicle UI elements:");
  console.log(JSON.stringify(candidates, null, 2));
}

async function openVehicleSelector(page) {
  console.log("[Vehicle] Attempting to locate vehicle selector trigger...");

  // Try common patterns WITHOUT assuming structure
  const selectors = [
    'button:has-text("Vehicle")',
    'button:has-text("Select Vehicle")',
    'button:has-text("Change Vehicle")',
    '[data-testid*="vehicle"]',
    '[class*="vehicle"]'
  ];

  for (const selector of selectors) {
    const el = await page.$(selector);
    if (el) {
      console.log(`[Vehicle] Found selector trigger: ${selector}`);
      await el.click();
      return true;
    }
  }

  console.log("[Vehicle] No selector trigger found.");
  return false;
}

module.exports = {
  logVehicleState,
  openVehicleSelector
};