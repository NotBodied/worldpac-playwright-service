const { updateJob } = require("./jobStore");
const { searchPartsService } = require("../playwright/services/partsService");

async function runJob(job_id, payload) {
  try {
    updateJob(job_id, { status: "running" });

    const results = await searchPartsService(payload);

    updateJob(job_id, {
      status: "complete",
      results: results.results || []
    });

  } catch (err) {
    updateJob(job_id, {
      status: "error",
      error: err.message
    });
  }
}

module.exports = { runJob };