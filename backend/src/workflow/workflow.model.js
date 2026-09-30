import mongoose from 'mongoose';

const stepSchema = new mongoose.Schema({
  id: { type: String, required: false },
  type: { type: String, required: false },
  label: { type: String, required: false },
  selector: { type: String, required: false },
  required: { type: Boolean, default: false },
  validation: { type: mongoose.Schema.Types.Mixed, default: {} },
  options: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  extensions: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const pageSchema = new mongoose.Schema({
  id: { type: String, required: false },
  title: { type: String, required: false },
  url: { type: String, required: false },
  steps: { type: [stepSchema], default: [] }
}, { _id: false });

const workflowSchema = new mongoose.Schema({
  name: { type: String, required: true },
  website: { type: String, required: false },
  url: { type: String, required: true },
  urlHash: { type: String, required: true, index: true },
  landingScreenshot: { type: String, required: false },
  schemaVersion: { type: String, default: "2.0" },
  schemaDefinition: {
    pages: { type: [pageSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    extensions: { type: mongoose.Schema.Types.Mixed, default: {} }
  }
}, {
  timestamps: true
});

export const Workflow = mongoose.model('Workflow', workflowSchema);
