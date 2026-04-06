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

    // 🔥 Use your service layer
    const { searchPartsService } = require("./services/partsService");

    const results = await searchPartsService({
      query,
      connection_id: "default", // temp fallback
      vehicle: req.body.vehicle_context || null,
      options: {
        limit: 5,
        sort: "best"
      }
    });

    // ⚠️ IMPORTANT: FitzFlow expects ARRAY, not object
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