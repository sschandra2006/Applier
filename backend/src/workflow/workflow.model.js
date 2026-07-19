import mongoose from 'mongoose';

const workflowSchema = new mongoose.Schema({
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['DRAFT', 'ACTIVE', 'DEPRECATED'], default: 'DRAFT' },
  schemaDefinition: { type: Object, required: true },
  steps: [{
    title: String,
    fields: [String]
  }]
}, { timestamps: true });

export const Workflow = mongoose.model('Workflow', workflowSchema);
