import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserRole } from 'src/schemas/user.schema';
import mongoose, { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Post } from 'src/schemas/post.schema';
import { Category } from 'src/schemas/category.schema';
import { isValidObjectId } from 'mongoose';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @InjectModel(Post.name) private postModel: Model<Post>,
  ) {}

  // CREATE NEW USER
  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.userModel.findOne({
      email: createUserDto.email,
    });
    if (existingUser)
      throw new ConflictException('User with this email already exists');

    // Start Transaction
    const session = await this.userModel.db.startSession();
    session.startTransaction();
    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
      const newUser = new this.userModel({
        ...createUserDto,
        password: hashedPassword,
      });

      // Exclude Password from returned user object
      const { password, ...userWithoutPassword } = (
        await newUser.save({ session })
      ).toObject();

      await session.commitTransaction();
      return userWithoutPassword;
    } catch (error) {
      await session.abortTransaction();
      console.error('User creation failed:', error);
      throw new InternalServerErrorException('Failed to create user');
    } finally {
      session.endSession();
    }
  }

  // GET ALL USERS
  async findAll(skip?: number, take?: number) {
    // TODO: Add pagination
    const offset = skip ?? 0;
    const limit = Math.min(take ?? 10, 100);

    const users = await this.userModel
      .find({}, '-password')
      .skip(offset)
      .limit(limit)
      .populate({
        path: 'posts',
        select: 'title published viewCount createdAt updatedAt',
        populate: { path: 'categories', select: 'name' },
      })
      .sort({ createdAt: -1 })
      .exec();

    return users;
  }

  // GET A SINGLE USER
  async findOne(id: string, currentUserId: string, userRole: UserRole) {
    // Check if id is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid User ID');
    }

    // Check if its Admin or Owner
    const isAdmin = userRole === UserRole.ADMIN;
    const isOwner = currentUserId === id;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('You can only view your own profile');
    }

    // Check if User exists
    const existingUser = await this.userModel.findById(id);
    if (!existingUser)
      throw new NotFoundException(`User with ID ${id} not found`);

    const user = await this.userModel
      .findById(id)
      .select('-password')
      .populate({
        path: 'posts',
        select: 'title published createdAt updatedAt',
        populate: { path: 'categories', select: 'name' },
      })
      .exec();

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  // UPDATE A USER
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    currentUserId: string,
    userRole: UserRole,
  ) {
    // Check if id is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid User ID');
    }

    // Check if its Admin or Owner
    const isAdmin = userRole === UserRole.ADMIN;
    const isOwner = currentUserId === id;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('You can only update your own profile');
    }

    // Check if user exists
    const existingUser = await this.userModel.findById(id);
    if (!existingUser)
      throw new NotFoundException(`User with ID ${id} not found`);

    // Check If any changes has been made
    const isDtoEmpty = Object.keys(updateUserDto).some((key) => {
      if (key === 'password') return updateUserDto.password !== undefined;
      return (updateUserDto as any)[key] !== (existingUser as any)[key];
    });
    if (!isDtoEmpty)
      throw new ConflictException('No changes detected to update');
    // If password is being updated, hash it
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .select('-password')
      .exec();

    if (!updatedUser)
      throw new InternalServerErrorException('Failed to update user');
    return updatedUser;
  }

  // DELETE A USER
  async remove(id: string, currentUserId: string) {
    // Check if id is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new BadRequestException('Invalid User ID');

    // Prevent self-deletion for admins
    if (currentUserId && id === currentUserId) {
      throw new ConflictException('You cannot delete your own account');
    }

    // Check if User exists
    const existedUser = await this.userModel.findById(id).populate('posts');
    if (!existedUser)
      throw new NotFoundException(`User with ID ${id} not found`);

    // Get all post IDs belonging to the user
    const postIds = existedUser.posts.map((post) => post._id || post);
    // Remove these posts  from all categories' posts arrays
    if (postIds.length > 0) {
      await this.categoryModel.updateMany(
        { posts: { $in: postIds } },
        { $pull: { posts: { $in: postIds } } },
      );

      // Delete all posts belonging to the user
      await this.postModel.deleteMany({ _id: { $in: postIds } });
    }
    // Finally, delete the user
    const deletedUser = await this.userModel
      .findByIdAndDelete(id)
      .select('-password')
      .exec();
    if (!deletedUser)
      throw new NotFoundException(`User with ID ${id} not found`);
    return deletedUser;
  }

  // USER STATS
  async getUserStats(id: string, currentUserId: string, userRole: UserRole) {
    // Validate post ID
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid User ID');

    // Check if its Admin or Owner
    const isAdmin = userRole === UserRole.ADMIN;
    const isOwner = currentUserId === id;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('You can only view your own stats');
    }

    const user = await this.userModel
      .findById(id)
      .populate('posts', 'viewCount published')
      .exec();

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    const totalViews = user.posts.reduce(
      (sum, post: any) => sum + post.viewCount,
      0,
    );

    const publishedPosts = user.posts.filter(
      (post: any) => post.published,
    ).length;
    const postStats = {
      userId: id,
      totalPosts: user.posts.length,
      publishedPosts,
      totalViews,
    };
    return postStats;
  }
}
