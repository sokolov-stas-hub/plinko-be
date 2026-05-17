import { Module } from '@nestjs/common';
import { SeedsModule } from '../seeds/seeds.module';
import { UsersService } from './users.service';

@Module({ imports: [SeedsModule], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
