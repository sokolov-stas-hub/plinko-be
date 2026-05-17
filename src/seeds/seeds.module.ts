import { Module } from '@nestjs/common';
import { SeedsController } from './seeds.controller';
import { SeedsService } from './seeds.service';

@Module({ controllers: [SeedsController], providers: [SeedsService], exports: [SeedsService] })
export class SeedsModule {}
