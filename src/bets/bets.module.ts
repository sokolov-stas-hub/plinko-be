import { Module } from '@nestjs/common';
import { BetsController } from './bets.controller';
import { BetsService } from './bets.service';
import { SeedsModule } from '../seeds/seeds.module';
import { WalletModule } from '../wallet/wallet.module';
import { ProgressionModule } from '../progression/progression.module';

@Module({
  imports: [SeedsModule, WalletModule, ProgressionModule],
  controllers: [BetsController],
  providers: [BetsService],
})
export class BetsModule {}
