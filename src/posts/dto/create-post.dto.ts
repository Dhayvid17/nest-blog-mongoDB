import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  MaxLength,
  MinLength,
  ArrayUnique,
  IsMongoId,
  ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Content must be at least 10 characters long' })
  @MaxLength(20000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content: string;

  @IsBoolean()
  @IsOptional()
  published?: boolean;

  @IsMongoId({ message: 'Invalid author ID format' })
  @IsOptional()
  authorId?: string;

  @ArrayUnique()
  @IsArray()
  @IsNotEmpty()
  @Type(() => String)
  @IsMongoId({ each: true, message: 'Invalid category ID format' })
  @ArrayMinSize(1, { message: 'At least one category is required' })
  categoryIds: string[];
}
