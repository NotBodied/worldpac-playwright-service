const API_KEY = process.env.SERVICE_API_KEY;
const express = require("express");
const router = express.Router();

const { searchPartsService } = require("../playwright/services/partsService");

const { createJob } = require("../jobs/jobStore");
const { runJob } = require("../jobs/jobRunner");
const crypto = require("crypto");

const { getJob } = require("../jobs/jobStore");

router.post("/search-parts", async (req, res) => {
  const job_id = crypto.randomUUID();

  createJob(job_id, {
    status: "pending",
    results: [],
    created_at: Date.now()
  });

  if (!req.body.credentials?.username) {
    console.warn("⚠️ Missing username in credentials");
  }

  // 🔥 Extract username BEFORE object
  const username = req.body.credentials?.username || "anon";

  runJob(job_id, {
    query: req.body.query,
    connection_id: `shop-${req.body.shop_id || "default"}-${username}`,
    vehicle: req.body.vehicle_context || null,
    selected_category_index: req.body.selected_category_index ?? null,
    credentials: req.body.credentials || null,
    options: {
      limit: 20,
      sort: "best"
    }
  });

  return res.json({
    job_id,
    status: "started"
  });
});

router.get("/search-parts/:job_id", (req, res) => {
  const job = getJob(req.params.job_id);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json(job);
});

module.exports = router;