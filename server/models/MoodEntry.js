const mongoose = require("mongoose");

const moodEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    note: { type: String, default: "", maxlength: 200 },
    checks: { type: [String], default: [] },
  },
  { timestamps: true }
);

moodEntrySchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("MoodEntry", moodEntrySchema);
