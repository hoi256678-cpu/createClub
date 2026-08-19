const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ["client", "counselor"], required: true },
    text: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const chatRoomSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    counselor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "ended", "reported"], default: "active" },
    messages: [messageSchema],
    rating: { type: Number, min: 1, max: 5, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("ChatRoom", chatRoomSchema);
