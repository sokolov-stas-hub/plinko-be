import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { AuthUser } from '../auth/types';
import { AvatarUploadInterceptor } from './avatar-upload.interceptor';
import { AvatarUploadResponse } from './dto/avatar-upload.response';
import { ProfileResponse } from './dto/profile.response';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth('access-token')
@Controller('profile')
@UseGuards(JwtAccessGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated player profile' })
  @ApiOkResponse({ type: ProfileResponse })
  getMe(@CurrentUser() u: AuthUser) {
    return this.profile.getMe(u.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated player profile' })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiBadRequestResponse({ description: 'Invalid nickname' })
  @ApiConflictResponse({ description: 'Nickname already taken' })
  updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.updateMe(u.id, dto);
  }

  @Post('avatar')
  @UseInterceptors(AvatarUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload the authenticated player avatar' })
  @ApiCreatedResponse({ type: AvatarUploadResponse })
  @ApiBadRequestResponse({ description: 'Invalid or missing avatar image' })
  uploadAvatar(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('avatar image is required');
    return this.profile.uploadAvatar(u.id, file.buffer);
  }
}
