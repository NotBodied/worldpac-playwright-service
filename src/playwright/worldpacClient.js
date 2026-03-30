const { getSession } = require("./sessionManager");

async function searchParts({ query, connection_id }) {
  const { page } = await getSession(connection_id);

  console.log("🔍 Searching:", query);

  await page.goto("https://example.com");
  await page.waitForTimeout(1000);

  return [
    {
      description: "Brake Pad Set",
      part_number: "BP123",
      price: 89.99,
      brand: "Bosch",
    },
  ];
}

module.exports = { searchParts };