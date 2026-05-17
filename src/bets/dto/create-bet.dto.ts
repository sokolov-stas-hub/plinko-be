import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, Max, Min } from 'class-validator';
import { MAX_ROWS, MIN_ROWS, Risk } from '../../game/types';

export class CreateBetDto {
  @IsNotEmpty()
  @Transform(({ value }) => BigInt(value))
  amount!: bigint;

  @IsInt() @Min(MIN_ROWS) @Max(MAX_ROWS)
  rows!: number;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  risk!: Risk;
}
