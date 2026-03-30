const API_KEY = process.env.SERVICE_API_KEY;
const express = require("express");
const router = express.Router();

const { searchParts } = require("../playwright/worldpacClient");

router.post("/search-parts", async (req, res) => {
  try {
    // 🔐 API KEY CHECK
    const incomingKey = req.headers["x-api-key"];

    console.log("Auth header:", incomingKey ? "present" : "missing");

    if (!incomingKey || incomingKey !== API_KEY) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    // 📦 BODY VALIDATION
    const { query, connection_id } = req.body;

    if (!query || !connection_id) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    // 🔍 MAIN LOGIC
    const results = await searchParts({ query, connection_id });

    // ✅ RESPONSE
    res.json(results);

  } catch (error) {
    console.error("❌ Error:", error);

    res.status(500).json({
      error: "Internal server error",
    });
  }
});

module.exports = router;