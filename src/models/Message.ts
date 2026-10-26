import mongoose, { Schema, Document, Model } from 'mongoose';
import { SocialChannel } from '@/types';
import { InteractiveContent } from '@/lib/whatsappInteractive';

export interface IMessage extends Document {
  id: string;
  conversationId: string;
  sender: 'contact' | 'agent' | 'bot';
  senderName?: string;
  text: string;
  timestamp: string;
  channel: SocialChannel;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  mediaUrl?: string;
  hasMedia?: boolean;
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  media?: {
    mimetype: string;
    data: string;
    size?: number;
    filename?: string | null;
    width?: number;
    height?: number;
  };
  aiGenerated?: boolean;
  interactive?: InteractiveContent;
  createdAt: Date;
}

const MessageSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    conversationId: { type: String, required: true, index: true },
    sender: {
      type: String,
      enum: ['contact', 'agent', 'bot'],
      required: true
    },
    senderName: { type: String },
    text: { type: String, default: '' },
    timestamp: { type: String, default: 'Ahora' },
    channel: {
      type: String,
      enum: ['whatsapp', 'instagram', 'twitter', 'messenger', 'email'],
      default: 'whatsapp'
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent'
    },
    mediaUrl: { type: String },
    hasMedia: { type: Boolean, default: false },
    mediaType: {
      type: String,
      enum: ['image', 'audio', 'video', 'document', 'sticker']
    },
    media: {
      mimetype: { type: String },
      data: { type: String },
      size: { type: Number },
      filename: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
    aiGenerated: { type: Boolean, default: false },
    interactive: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

export const MessageModel: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
