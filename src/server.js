require("dotenv").config();
const express = require("express");

const partsRoutes = require("./routes/parts");

const app = express();
app.use(express.json());

app.use("/api", partsRoutes);

app.get("/", (req, res) => {
  res.send("Worldpac Playwright Service Running");
});

const PORT = process.env.PORT;

if (!PORT) {
  throw new Error("PORT is not defined");
}

app.post("/", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Missing query"
      });
    }

    const { searchPartsService } = require("./playwright/services/partsService");

    // ✅ DEFINE THESE BEFORE OBJECT
    const username = req.body.credentials?.username || "anon";
    const shop_id = req.body.shop_id || "default";

    const results = await searchPartsService({
      query,
      connection_id: `shop-${shop_id}-${username}-${Date.now()}`,
      vehicle: req.body.vehicle_context || null,
      selected_category_index: req.body.selected_category_index ?? null,
      credentials: req.body.credentials || null,
      options: {
        limit: 20,
        sort: "best"
      }
    });

    res.json(results.results);

  } catch (err) {
    console.error("❌ Root route error:", err);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});