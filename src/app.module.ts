import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { GameModule } from './game/game.module';

@Module({ imports: [ConfigModule, PrismaModule, CommonModule, GameModule] })
export class AppModule {}
