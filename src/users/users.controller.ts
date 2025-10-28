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
  DefaultValuePipe,
  ParseIntPipe,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/schemas/user.schema';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // CREATE NEW USER
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  // GET ALL USERS
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip?: number,
    @Query('take', new DefaultValuePipe(10), ParseIntPipe) take?: number,
  ) {
    return this.usersService.findAll(skip, take);
  }

  // GET A SINGLE USER STATS
  @Get(':id/stats')
  getUserStats(@Param('id') id: string, @CurrentUser() user: any) {
    // Allow admin to view all stats while user view their stats
    const isAdmin = user.role === UserRole.ADMIN;
    const userSelf = id === user._id.toString();

    if (!isAdmin && !userSelf)
      throw new ForbiddenException('You can only view your own statistics');
    return this.usersService.getUserStats(id);
  }

  // GET A SINGLE USER
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    // Allow admin to view all stats while user view their stats
    const isAdmin = user.role === UserRole.ADMIN;
    const userSelf = id === user._id.toString();

    if (!isAdmin && !userSelf)
      throw new ForbiddenException('You can only view your own profile');
    return this.usersService.findOne(id);
  }

  // UPDATE A USER
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    // Allow admin to view all stats while user view their stats
    const isAdmin = user.role === UserRole.ADMIN;
    const userSelf = id === user._id.toString();

    if (!isAdmin && !userSelf)
      throw new ForbiddenException('You can only update your own profile');

    // Only admin can change roles
    if (!isAdmin && updateUserDto.role)
      throw new ForbiddenException(
        'You do not have permission to change user roles',
      );
    return this.usersService.update(id, updateUserDto);
  }

  // DELETE A USER
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
