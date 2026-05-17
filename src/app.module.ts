import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SeedsModule } from './seeds/seeds.module';
import { WalletModule } from './wallet/wallet.module';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    SeedsModule,
    WalletModule,
    GameModule,
  ],
})
export class AppModule {}
