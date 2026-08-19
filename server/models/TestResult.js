const mongoose = require("mongoose");

const testResultSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    score: { type: Number, required: true },
    label: { type: String, required: true },
    color: { type: String, required: true },
    needsSupport: { type: Boolean, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("TestResult", testResultSchema);
