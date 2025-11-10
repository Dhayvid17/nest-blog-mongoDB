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
import { User, UserRole } from 'src/schemas/user.schema';
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

  // GET ALL USERS (optional filters: published, pagination)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip?: number,
    @Query('take', new DefaultValuePipe(10), ParseIntPipe) take?: number,
  ) {
    return this.usersService.findAll(skip, take);
  }

  // GET A SINGLE USER STATISTICS
  @Get(':id/stats')
  getUserStats(
    @Param('id') id: string,
    @CurrentUser() user: { _id: string; role: UserRole; email: string },
  ) {
    return this.usersService.getUserStats(id, user._id.toString(), user.role);
  }

  // GET A SINGLE USER
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { _id: string; role: UserRole; email: string },
  ) {
    return this.usersService.findOne(id, user._id.toString(), user.role);
  }

  // UPDATE A USER
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: { _id: string; role: UserRole; email: string },
  ) {
    // Only admin can change roles
    if (user.role !== UserRole.ADMIN && updateUserDto.role)
      throw new ForbiddenException(
        'You do not have permission to change user roles',
      );
    return this.usersService.update(
      id,
      updateUserDto,
      user._id.toString(),
      user.role,
    );
  }

  // DELETE A USER
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { _id: string; role: UserRole; email: string },
  ) {
    return this.usersService.remove(id, user._id);
  }
}
