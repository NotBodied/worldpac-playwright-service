const { getBrowser } = require("./browserManager");

const sessions = new Map();

async function getSession(connection_id) {
  if (sessions.has(connection_id)) {
    return sessions.get(connection_id);
  }

  const browser = await getBrowser();

  const context = await browser.newContext();
  const page = await context.newPage();

  const session = { context, page };

  sessions.set(connection_id, session);

  console.log(`🔐 Session created: ${connection_id}`);

  return session;
}

module.exports = { getSession };