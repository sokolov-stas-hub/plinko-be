import { Module } from '@nestjs/common';
import { SeedsModule } from '../seeds/seeds.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [SeedsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
