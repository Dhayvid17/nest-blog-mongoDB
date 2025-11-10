import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Category } from 'src/schemas/category.schema';
import mongoose, { Model } from 'mongoose';
import { Post } from 'src/schemas/post.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @InjectModel(Post.name) private postModel: Model<Post>,
  ) {}
  // CREATE NEW CATEGORY
  async create(createCategoryDto: CreateCategoryDto) {
    try {
      // Check if category with the same name exists
      const existingCategory = await this.categoryModel.findOne({
        name: createCategoryDto.name,
      });

      if (existingCategory)
        throw new ConflictException('Category with that name already exists');

      const newCategory = new this.categoryModel(createCategoryDto);
      return await newCategory.save();
    } catch (error) {
      throw new InternalServerErrorException('Failed to create category');
    }
  }

  // GET ALL CATEGORIES
  async findAll() {
    return this.categoryModel.find().sort({ name: 1 }).populate('posts').exec();
  }

  // GET A SINGLE CATEGORY
  async findOne(id: string) {
    // Check if id is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid category ID');
    }

    const category = await this.categoryModel
      .findById(id)
      .populate('posts')
      .exec();
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  // UPDATE A CATEGORY
  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    // Check if id is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid category ID');
    }

    // Check if category with the same name exists
    const existingCategory = await this.categoryModel.findById(id);
    if (!existingCategory)
      throw new NotFoundException(`Category with ID ${id} not found`);

    // Check If changes were made
    const hasChanges = Object.keys(updateCategoryDto).some(
      (key) => updateCategoryDto[key] !== existingCategory[key],
    );
    if (!hasChanges)
      throw new ConflictException('No changes detected in the update data');

    // Check if changing name to an existing name
    if (
      updateCategoryDto.name &&
      updateCategoryDto.name !== existingCategory.name
    ) {
      const nameExists = await this.categoryModel.findOne({
        name: updateCategoryDto.name,
      });
      if (nameExists)
        throw new ConflictException('Category name already in use');
    }
    const updatedCategory = await this.categoryModel
      .findByIdAndUpdate(id, updateCategoryDto, { new: true })
      .exec();

    if (!updatedCategory)
      throw new InternalServerErrorException('Failed to update category');
    return updatedCategory;
  }

  // DELETE A CATEGORY
  async remove(id: string) {
    // Check if id is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid category ID');
    }

    // Check if category exists
    const existedCategory = await this.categoryModel
      .findById(id)
      .populate('posts');
    if (!existedCategory)
      throw new NotFoundException(`Category with ID ${id} not found`);

    // Check for posts that would become orphaned (only have this category)
    const orphanedPosts = await this.postModel.find({
      categories: id,
    });

    for (const post of orphanedPosts) {
      if (post.categories.length === 1) {
        throw new ConflictException(
          `Cannot delete category. Post "${post.title}" would have no categories. Please reassign it first.`,
        );
      }
    }
    // Remove references to this category in posts' categories arrays
    await this.postModel.updateMany(
      { categories: id },
      { $pull: { categories: id } },
    );
    // Delete the category
    const deletedCategory = await this.categoryModel.findByIdAndDelete(id);
    if (!deletedCategory)
      throw new InternalServerErrorException('Failed to delete category');
    return deletedCategory;
  }
}
