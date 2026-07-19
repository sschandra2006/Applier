import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: String, enum: ['USER', 'AI'], required: true },
  content: { type: String, required: true },
  metadata: { type: Object }
}, { timestamps: true });

export const Message = mongoose.model('Message', messageSchema);
