import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmailOtpDocument = HydratedDocument<EmailOtp>;

@Schema({ timestamps: true, versionKey: false })
export class EmailOtp {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, enum: ['verification', 'password-reset'] })
  purpose!: 'verification' | 'password-reset';

  @Prop({ required: true, select: false })
  codeHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: 0 })
  attempts!: number;

  @Prop({ required: true })
  lastSentAt!: Date;
}

export const EmailOtpSchema = SchemaFactory.createForClass(EmailOtp);
EmailOtpSchema.index({ userId: 1, purpose: 1 }, { unique: true });
EmailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
