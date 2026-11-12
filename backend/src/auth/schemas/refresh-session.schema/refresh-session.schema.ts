import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;

@Schema({ timestamps: true, versionKey: false })
export class RefreshSession {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, select: false })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: false, index: true })
  revoked!: boolean;
}

export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSession);
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
