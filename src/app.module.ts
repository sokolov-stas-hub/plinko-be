import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SeedsModule } from './seeds/seeds.module';
import { WalletModule } from './wallet/wallet.module';
import { GameModule } from './game/game.module';
import { BetsModule } from './bets/bets.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        redact: [
          'req.headers.authorization',
          'req.body.password',
          'req.body.refreshToken',
        ],
      },
    }),
    ConfigModule,
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    SeedsModule,
    WalletModule,
    GameModule,
    BetsModule,
  ],
})
export class AppModule {}
