import mongoose, { Schema, Document, Model } from 'mongoose';
import { formatTime } from '@/lib/time';

export interface IWebhookLog extends Document {
  id: string;
  timestamp: string;
  event: string;
  statusCode: number;
  payload: Record<string, unknown>;
  durationMs: number;
}

const WebhookLogSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    timestamp: { type: String, default: () => formatTime() },
    event: { type: String, required: true },
    statusCode: { type: Number, default: 200 },
    payload: { type: Schema.Types.Mixed, default: {} },
    durationMs: { type: Number, default: 120 }
  },
  { timestamps: true }
);

export const WebhookLogModel: Model<IWebhookLog> = 
  mongoose.models.WebhookLog || mongoose.model<IWebhookLog>('WebhookLog', WebhookLogSchema);
