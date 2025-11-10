import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { Post } from './post.schema';

@Schema({ timestamps: true })
export class Category extends Document {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ type: String, default: '' })
  description?: string;

  // ADD RELATIONSHIPS ON CATEGORY =>POST[] MANY TO MANY FIELD
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }] })
  posts: Post[];
}

export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ name: 1 }, { unique: true }); // Unique constraint
