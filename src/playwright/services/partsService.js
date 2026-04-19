// services/partsService.js

const { searchParts } = require("../worldpacClient");

async function searchPartsService({
  query,
  connection_id,
  vehicle = null,
  selected_category_index = null,
  credentials = null,
  options = {}
}) {

  if (!credentials) {
  return {
    error: "Worldpac not configured",
    code: "NO_SUPPLIER_CREDENTIALS"
  };
}

  const start = Date.now();

  const {
    limit = 5,
    sort = "best"
  } = options;

  // 🔥 CALL YOUR EXISTING FUNCTION
  const rawParts = await searchParts({
    query,
    connection_id,
    vehicle,
    selected_category_index,
    credentials
  });

 if (rawParts?.type === "category_selection") {
  return {
    type: "category_selection",
    categories: rawParts.categories,
    query,
    vehicle
  };
} 

  // Normalize
  const normalized = normalizeParts(rawParts);

  // Sort
  const sorted = sortParts(normalized, sort);

  // Limit
  // 🔥 RETURN ALL RESULTS (frontend will handle pagination)
  const results = sorted;

  console.log("🧪 FINAL API OUTPUT SAMPLE:",
    results.slice(0, 3).map(p => ({
      part_number: p.part_number,
      image_url: p.image_url
    }))
  );

  return {
    query,
    vehicle,
    results,
    meta: {
      total_found: normalized.length,
      returned: normalized.length,
      execution_time_ms: Date.now() - start
    }
  };
}

function normalizeParts(parts) {
  return parts.map(p => {
    const is_special_order =
      p.location?.toLowerCase().includes("special order") || false;

    return {
      // ✅ REQUIRED BY FITZFLOW
      supplier: "Worldpac",
      part_number: p.part_number || "",
      description: p.description || "",
      brand: p.brand || "",

      // 🔥 IMPORTANT: price → cost
      cost: p.price ?? 0,
      list_price: p.list_price ?? null,
      
      image_url: p.image_url || null,
      
      // Convert availability into readable string
      availability: formatAvailability(p),

      confidence: "live",

      // Optional but powerful
      attributes: buildAttributes(p),

      // 🧠 KEEP INTERNAL (NOT REQUIRED BUT USEFUL)
      _meta: {
        score: calculateScore(p),
        estimated_delivery: estimateDelivery(p),
        is_special_order
      }
    };
  });
}

function calculateScore(p) {
  let score = 0;

  if (p.price != null) score += 30;
  if (p.availability > 0) score += 30;
  if (!p.location?.includes("Special Order")) score += 20;

  if (p.price != null) {
    score += Math.max(0, 20 - p.price);
  }

  return Math.round(score);
}

function formatAvailability(p) {
  if (!p.location) return "Unknown";

  if (p.location.includes("Special Order")) {
    return "Ships 2-3 Days";
  }

  if (p.availability > 0) {
    return "In Stock";
  }

  return "Check Availability";
}

function buildAttributes(p) {
  const attrs = {};

  // 🔥 INCLUDE SCRAPED ATTRIBUTES FIRST
  if (Array.isArray(p.attributes)) {
    for (const item of p.attributes) {
      if (typeof item !== "string") continue;

      const [key, ...rest] = item.split(":");
      const value = rest.join(":").trim();

      if (key && value) {
        const cleanKey = key.trim();

        // handle duplicates (Position: Left, Position: Front)
        if (!attrs[cleanKey]) {
          const finalValue = Array.isArray(value)
            ? value.join(", ")
            : value;

          attrs[cleanKey] = finalValue;
        } else if (Array.isArray(attrs[cleanKey])) {
          attrs[cleanKey].push(value);
        } else {
          attrs[cleanKey] = [attrs[cleanKey], value];
        }
      }
    }
  }

  // 🔥 KEEP EXISTING METADATA
  if (p.location) {
    attrs.location = p.location;
  }

  if (p.brand) {
    attrs.brand = p.brand;
  }

  return attrs;
}

function estimateDelivery(p) {
  if (!p.location) return "Unknown";

  if (p.location.includes("Special Order")) {
    return "2-3 days";
  }

  return "Same Day";
}

function sortParts(parts, sort) {
  const copy = [...parts];

  if (sort === "cheapest") {
    return copy.sort((a, b) => (a.cost ?? 9999) - (b.cost ?? 9999));
  }

  if (sort === "fastest") {
    return copy.sort((a, b) => {
      if (a.is_special_order === b.is_special_order) return 0;
      return a.is_special_order ? 1 : -1;
    });
  }

  return copy.sort((a, b) => {
    // 1. In-stock first
    if (a.is_special_order !== b.is_special_order) {
        return a.is_special_order ? 1 : -1;
    }

    // 2. Higher availability
    if ((b.availability ?? 0) !== (a.availability ?? 0)) {
        return (b.availability ?? 0) - (a.availability ?? 0);
    }

    // 3. Lower price
    return (a.cost ?? 9999) - (b.cost ?? 9999);
 });
    }

module.exports = { searchPartsService };