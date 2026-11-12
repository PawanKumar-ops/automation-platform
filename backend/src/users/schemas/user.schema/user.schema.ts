import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, versionKey: false })
export class User {
  createdAt!: Date;
  updatedAt!: Date;
  @Prop({ required: true, trim: true, minlength: 1, maxlength: 100 })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ default: false, index: true })
  isEmailVerified!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
