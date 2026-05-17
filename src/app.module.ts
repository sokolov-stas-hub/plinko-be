import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from './config/config.module';

@Module({ imports: [ConfigModule, PrismaModule] })
export class AppModule {}
