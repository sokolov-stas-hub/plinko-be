import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, Max, Min } from 'class-validator';
import { MAX_ROWS, MIN_ROWS, RISKS, Risk } from '../../game/types';

export class CreateBetDto {
  @ApiProperty({
    type: String,
    example: '1000000',
    description: 'Bet amount in minimal units. 1 credit = 1,000,000 minimal units.',
  })
  @IsNotEmpty()
  @Transform(({ value }) => BigInt(value))
  amount!: bigint;

  @ApiProperty({ minimum: MIN_ROWS, maximum: MAX_ROWS, example: 16 })
  @IsInt() @Min(MIN_ROWS) @Max(MAX_ROWS)
  rows!: number;

  @ApiProperty({ enum: RISKS, example: 'LOW' })
  @IsEnum(RISKS)
  risk!: Risk;
}
