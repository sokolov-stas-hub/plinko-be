import { Module } from '@nestjs/common';
import { GameConfigController } from './config.controller';

@Module({ controllers: [GameConfigController] })
export class GameModule {}
