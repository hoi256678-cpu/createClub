require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({ origin: FRONTEND_URL }));

app.get("/api/health", (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  res.json({
    status: "ok",
    mongoConnected,
    timestamp: new Date().toISOString(),
  });
});

async function start() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI가 설정되지 않았습니다. DB 없이 서버만 기동합니다.");
  } else {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log("MongoDB 연결 성공");
    } catch (err) {
      console.error("MongoDB 연결 실패:", err.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
  });
}

start();
