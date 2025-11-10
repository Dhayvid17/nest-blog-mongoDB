import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { Post } from './post.schema';

// Define ENUM for UserRole
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: String, default: '' })
  bio?: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  // Refresh token array to store all multiple active refresh token
  @Prop({
    type: [
      {
        token: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, default: Date.now },
        deviceInfo: { type: String, default: 'Unknown Device' },
      },
    ],
    default: [],
  })
  refreshTokens: Array<{
    token: string;
    createdAt: Date;
    expiresAt: Date;
    deviceInfo?: string;
  }>;

  // Last User login timestamps
  @Prop({ type: Date })
  lastLogin?: Date;

  // ADD RELATIONSHIPS ON USER =>POST[] FIELD
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }] })
  posts: Post[];
}

export const UserSchema = SchemaFactory.createForClass(User);

// Index on refreshtokens.token for faster logout operations
UserSchema.index({ 'refreshTokens.token': 1 });
UserSchema.index({ 'refreshTokens.expiresAt': 1 }); //Added for cleanup
UserSchema.index({ email: 1 });
