const express = require("express");
const router = express.Router();

const { searchParts } = require("../playwright/worldpacClient");

router.post("/search-parts", async (req, res) => {
  try {
    const { query, connection_id } = req.body;

    if (!query || !connection_id) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    const results = await searchParts({ query, connection_id });

    res.json(results);
  } catch (error) {
    console.error("❌ Error:", error);

    res.status(500).json({
      error: "Internal server error",
    });
  }
});

module.exports = router;