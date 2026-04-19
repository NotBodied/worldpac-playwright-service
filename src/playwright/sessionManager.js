const { getBrowser } = require("./browserManager");

const sessions = new Map();

async function getSession(connection_id, options = {}) {
  const { forceNew = false } = options;

  // 🔥 DESTROY OLD SESSION IF FORCED
  if (forceNew && sessions.has(connection_id)) {
    console.log(`♻️ Resetting session: ${connection_id}`);

    const old = sessions.get(connection_id);

    try {
      await old.context.close();
    } catch (err) {
      console.warn("⚠️ Failed to close old context");
    }

    sessions.delete(connection_id);
  }

  // 🔁 RETURN EXISTING IF STILL VALID
  if (sessions.has(connection_id)) {
    return sessions.get(connection_id);
  }

  // 🆕 CREATE NEW SESSION
  const browser = await getBrowser();

  const context = await browser.newContext();
  const page = await context.newPage();

  const session = { context, page };

  sessions.set(connection_id, session);

  console.log(`🔐 New session created: ${connection_id}`);

  return session;
}

module.exports = { getSession };