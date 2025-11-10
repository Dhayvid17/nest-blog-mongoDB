import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { UserRole } from 'src/schemas/user.schema';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // CREATE NEW POST
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createPostDto: CreatePostDto,
    @CurrentUser() user: { _id: string; role: UserRole; email: string },
  ) {
    // Override authorId with current user"s Id to prevent users from creating posts as others
    createPostDto.authorId = user._id.toString();
    return this.postsService.create(createPostDto);
  }

  // GET ALL POSTS
  @Public()
  @Get()
  findAll(
    @Query('published') published?: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip?: number,
    @Query('take', new DefaultValuePipe(10), ParseIntPipe) take?: number,
  ) {
    const publishedBool =
      published === undefined ? undefined : published === 'true';
    return this.postsService.findAll(publishedBool, skip, take);
  }

  // SEARCH POSTS
  @Public()
  @Get('search')
  searchPosts(@Query('q') query: string) {
    return this.postsService.searchPosts(query);
  }

  // GET A SINGLE POST
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }

  // UPDATE A POST
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @CurrentUser() user: { _id: string; role: UserRole; email: string },
  ) {
    return this.postsService.update(
      id,
      updatePostDto,
      user._id.toString(),
      user.role,
    );
  }

  // DELETE A POST
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { _id: string; role: UserRole; email: string },
  ) {
    return this.postsService.remove(id, user._id.toString(), user.role);
  }
}
