const { updateJob } = require("./jobStore");
const { searchPartsService } = require("../playwright/services/partsService");

async function runJob(job_id, payload) {
  console.log("🧠 JOB START:", job_id);

  try {
    updateJob(job_id, { status: "running" });

    const result = await searchPartsService(payload);

    console.log("📦 SERVICE RESULT:", result?.results?.length);

    updateJob(job_id, {
      status: "complete",
      ...(result.type === "category_selection"
        ? { type: "category_selection", categories: result.categories }
        : { results: result.results || [] }
      )
    });

    console.log("✅ JOB COMPLETE:", job_id);

  } catch (err) {
    console.error("❌ JOB FAILED:", err);

    updateJob(job_id, {
      status: "error",
      error: err.message
    });
  }
}

module.exports = { runJob };