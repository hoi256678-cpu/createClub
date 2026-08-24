const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    body: { type: String, required: true, maxlength: 12_000_000 },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notice", noticeSchema);
