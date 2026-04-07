const jobs = new Map();

function createJob(id, data) {
  jobs.set(id, data);
}

function getJob(id) {
  return jobs.get(id);
}

function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, ...updates });
}

// 🔥 cleanup (important)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.created_at > 5 * 60 * 1000) {
      jobs.delete(id);
    }
  }
}, 60000);

module.exports = { createJob, getJob, updateJob };