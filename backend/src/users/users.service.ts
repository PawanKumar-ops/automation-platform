import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  async findByEmail(email: string, includePassword = false): Promise<UserDocument | null> {
    const query = this.users.findOne({ email: normalizeEmail(email) });
    if (includePassword) query.select('+passwordHash');
    return query.exec() as Promise<UserDocument | null>;
  }

  async findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.users.findById(id).exec() as Promise<UserDocument | null>;
  }

  async create(input: { name: string; email: string; passwordHash: string }): Promise<UserDocument> {
    return new this.users({ ...input, email: normalizeEmail(input.email) }).save() as Promise<UserDocument>;
  }

  async markVerified(id: string): Promise<void> {
    const user = await this.users.findByIdAndUpdate(id, { isEmailVerified: true }, { new: true }).exec();
    if (!user) throw new NotFoundException('Account not found');
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.users.updateOne({ _id: id }, { passwordHash }).exec();
  }

  async profile(id: string) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Account not found');
    return { id: user.id, name: user.name, email: user.email, isEmailVerified: user.isEmailVerified, createdAt: user.createdAt };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
