import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Post } from 'src/schemas/post.schema';
import { User, UserRole } from 'src/schemas/user.schema';
import { Category } from 'src/schemas/category.schema';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<Post>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
  ) {}
  // CREATE NEW POST
  async create(createPostDto: CreatePostDto) {
    const { categoryIds, authorId, ...postData } = createPostDto;

    // Ensure at least one category is provided
    if (!categoryIds || categoryIds.length === 0)
      throw new BadRequestException('At least one category is required');

    // Validate authorId
    if (!authorId) throw new BadRequestException('Author ID is required');

    // Validate author ID
    if (!isValidObjectId(authorId))
      throw new BadRequestException('Invalid author ID');

    // Validate all category IDs
    for (const categoryId of categoryIds) {
      if (!isValidObjectId(categoryId))
        throw new BadRequestException(`Invalid category ID: ${categoryId}`);
    }

    // Verify that author exists
    const author = await this.userModel.findById(authorId);
    if (!author) throw new BadRequestException('Author does not exist');

    // Verify that all categories exist
    const categories = await this.categoryModel.find({
      _id: { $in: categoryIds },
    });
    if (categories.length !== categoryIds.length)
      throw new BadRequestException('One or more categories do not exist');

    // Start Session
    const session = await this.postModel.db.startSession();
    session.startTransaction();

    try {
      const post = new this.postModel({
        ...postData,
        authorId: authorId,
        categories: categoryIds,
      });
      await post.save({ session });

      // Add reference to this post in the author's posts array
      await this.userModel.findByIdAndUpdate(
        authorId,
        {
          $push: { posts: post._id },
        },
        { new: true, session },
      );

      // Add reference to each category in the post's categories array
      await this.categoryModel.updateMany(
        { _id: { $in: categoryIds } },
        { $push: { posts: post._id } },
        { session },
      );

      await session.commitTransaction();
      // Populate author and categories before returning
      await post.populate([
        { path: 'authorId', select: 'id name email' },
        { path: 'categories', select: 'id name' },
      ]);
      return post;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // GET ALL POSTS (with optional published filter and pagination)
  async findAll(published?: boolean, skip?: number, take?: number) {
    const offset = skip || 0;
    const limit = Math.min(take ?? 10, 100); // Default 10, max 100

    const filter = published !== undefined ? { published } : {};
    try {
      // Fetch posts with filters, pagination, and populate author and categories
      const posts = await this.postModel
        .find(filter)
        .skip(offset)
        .limit(limit)
        .populate([
          { path: 'authorId', select: 'id name email' },
          { path: 'categories', select: 'id name' },
        ])
        .sort({ createdAt: -1 })
        .exec();
      return posts;
    } catch (error) {
      throw new InternalServerErrorException('Failed to get all posts');
    }
  }

  // GET A SINGLE POST BY ID (Increment viewCount automatically)
  async findOne(id: string) {
    // Validate post ID
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post ID');

    // Find Post and update the viewcount
    const post = await this.postModel
      .findByIdAndUpdate(
        id,
        { $inc: { viewCount: 1 } },
        { new: true }, // Return the updated document
      )
      .populate({
        path: 'authorId',
        select: 'id name email',
      })
      .populate({
        path: 'categories',
        select: 'id name',
      })
      .exec();

    if (!post) throw new NotFoundException(`Post with ID ${id} not found`);
    return post;
  }

  // UPDATE A POST
  async update(
    id: string,
    updatePostDto: UpdatePostDto,
    currentUserId: string,
    userRole: UserRole,
  ) {
    // Validate post ID
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post ID');

    const { categoryIds, authorId, ...postData } = updatePostDto;

    // Check if the post exists
    const existingPost = await this.postModel.findById(id).exec();
    if (!existingPost)
      throw new NotFoundException(`Post with ID ${id} not found`);

    // Ownership & role check
    const isAdmin = userRole === UserRole.ADMIN;
    const isAuthor =
      existingPost.authorId.toString() === currentUserId.toString();
    if (!isAdmin && !isAuthor)
      throw new ForbiddenException(
        'You do not have permission to edit this post',
      );

    // Handle authorId changes (admin only)
    if (authorId !== undefined) {
      // Validate author ID format
      if (!isValidObjectId(authorId))
        throw new BadRequestException('Invalid author ID');
      // Check if authorId is actually changing
      if (authorId.toString() !== existingPost.authorId.toString()) {
        // Only admins can change the author
        if (!isAdmin) {
          throw new ForbiddenException(
            'Only administrators can change the author of a post',
          );
        }

        // Verify the new author exists
        const newAuthor = await this.userModel.findById(authorId).exec();
        if (!newAuthor) {
          throw new NotFoundException(`Author with ID ${authorId} not found`);
        }
      }
    }
    // Validate category IDs if provided
    if (categoryIds !== undefined) {
      if (categoryIds.length === 0) {
        throw new BadRequestException('At least one category is required');
      }

      for (const categoryId of categoryIds) {
        if (!isValidObjectId(categoryId))
          throw new BadRequestException(`Invalid category ID: ${categoryId}`);
      }

      // Verify that all categories exist
      const categories = await this.categoryModel.find({
        _id: { $in: categoryIds },
      });
      if (categories.length !== categoryIds.length)
        throw new BadRequestException('One or more categories do not exist');
    }

    // Check for actual changes
    const hasDataChanges = Object.keys(postData).some((key) => {
      const newValue = postData[key];
      const oldValue = existingPost[key];

      if (typeof newValue === 'string' && typeof oldValue === 'string') {
        return newValue.trim() !== oldValue.trim();
      }
      return newValue !== oldValue;
    });

    const existingCategoryIds = existingPost.categories.map((c) =>
      c.toString(),
    );
    const hasCategoryChanges =
      categoryIds !== undefined &&
      (categoryIds.length !== existingCategoryIds.length ||
        categoryIds.some((catId) => !existingCategoryIds.includes(catId)));

    const hasAuthorChange =
      authorId !== undefined &&
      authorId.toString() !== existingPost.authorId.toString();

    // Check if any field was provided
    const hasAnyFieldProvided =
      Object.keys(postData).length > 0 ||
      categoryIds !== undefined ||
      authorId !== undefined;

    if (!hasAnyFieldProvided) {
      throw new BadRequestException('No update data provided');
    }
    if (!hasDataChanges && !hasCategoryChanges && !hasAuthorChange)
      throw new ConflictException('No changes detected in the update data');

    // Start Session (only after all validations pass)
    const session = await this.postModel.db.startSession();
    session.startTransaction();

    try {
      // Handle authorId change
      if (hasAuthorChange) {
        // Remove post reference from old author
        await this.userModel.findByIdAndUpdate(
          existingPost.authorId,
          {
            $pull: { posts: id },
          },
          { session },
        );

        // Add post reference to new author
        await this.userModel.findByIdAndUpdate(
          authorId,
          {
            $addToSet: { posts: id },
          },
          { session },
        );
      }
      // Handle categoryIds change
      if (hasCategoryChanges) {
        const categoriesToAdd = categoryIds!;

        // Remove post reference from old categories
        const categoriesToRemove = existingCategoryIds.filter(
          (catId) => !categoriesToAdd.includes(catId),
        );
        if (categoriesToRemove.length > 0) {
          await this.categoryModel.updateMany(
            { _id: { $in: categoriesToRemove } },
            { $pull: { posts: id } },
            { session },
          );
        }

        // Add post reference to new categories
        const categoriesToActuallyAdd = categoriesToAdd.filter(
          (catId) => !existingCategoryIds.includes(catId),
        );
        if (categoriesToActuallyAdd.length > 0) {
          await this.categoryModel.updateMany(
            { _id: { $in: categoriesToActuallyAdd } },
            { $push: { posts: id } },
            { session },
          );
        }
      }

      // Build update object
      const dataToUpdate: any = { ...postData };
      if (hasAuthorChange) dataToUpdate.authorId = authorId;
      if (hasCategoryChanges) dataToUpdate.categories = categoryIds;

      // Proceed with the update
      const updatedPost = await this.postModel
        .findByIdAndUpdate(id, dataToUpdate, {
          new: true,
          session,
        })
        .populate({
          path: 'authorId',
          select: 'id name email',
        })
        .populate({
          path: 'categories',
          select: 'id name',
        })
        .exec();
      await session.commitTransaction();
      return updatedPost;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // DELETE A POST
  async remove(id: string, currentUserId: string, userRole: UserRole) {
    // Validate post ID
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post ID');

    // Check if the post exists and delete
    const existingPost = await this.postModel.findById(id).exec();
    if (!existingPost)
      throw new NotFoundException(`Post with ID ${id} not found`);

    // Allow if user is admin to delete any post, allow only if user is the post author
    const isAdmin = userRole === UserRole.ADMIN;
    const isAuthor =
      existingPost.authorId.toString() === currentUserId.toString();
    if (!isAdmin && !isAuthor)
      throw new ForbiddenException(
        'You do not have permission to delete this post',
      );
    // Start Session
    const session = await this.postModel.db.startSession();
    session.startTransaction();

    try {
      const deletedPost = await this.postModel
        .findByIdAndDelete(id)
        .populate({
          path: 'authorId',
          select: 'id name email',
        })
        .populate({
          path: 'categories',
          select: 'id name',
        })
        .session(session)
        .exec();

      if (!deletedPost)
        throw new NotFoundException(`Post with ID ${id} not found`);

      // Remove references to this post in users' posts arrays
      await this.userModel.findByIdAndUpdate(
        deletedPost.authorId,
        {
          $pull: { posts: id },
        },
        { session },
      );

      // Remove references to this post in categories' posts arrays
      const categoryIds = deletedPost.categories.map((cat) => cat._id || cat);
      await this.categoryModel.updateMany(
        { _id: { $in: categoryIds } },
        { $pull: { posts: id } },
        { session },
      );
      await session.commitTransaction();
      return deletedPost;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // SEARCH POSTS BY KEYWORD IN TITLE OR CONTENT
  async searchPosts(query: string) {
    if (!query || query.trim() === '') {
      throw new BadRequestException('Search query cannot be empty');
    }

    const posts = await this.postModel
      .find({ $text: { $search: query } })
      .populate({
        path: 'authorId',
        select: 'id name email',
      })
      .populate({
        path: 'categories',
        select: 'id name',
      })
      .exec();

    return posts;
  }
}
