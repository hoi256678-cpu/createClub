const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: { type: String, required: true },
  role: { type: String, required: true, enum: ["counselor", "client"] },
  counselorProfile: {
    major: String,
    year: String,
    specialties: [String],
    bio: String,
    avatarBg: String,
    avatarColor: String,
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    sessionCount: { type: Number, default: 0 },
    recentSessions: { type: Number, default: 0 },
    online: { type: Boolean, default: false },
  },
  clientProfile: {
    ageGroup: String,
    concerns: [String],
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
