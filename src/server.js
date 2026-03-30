require("dotenv").config();
const express = require("express");

const partsRoutes = require("./routes/parts");

const app = express();
app.use(express.json());

app.use("/api", partsRoutes);

app.get("/", (req, res) => {
  res.send("Worldpac Playwright Service Running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});