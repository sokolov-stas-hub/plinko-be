import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MAX_ROWS, MIN_ROWS, Risk } from '../../game/types';

export class ListBetsQuery {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  risk?: Risk;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt() @Min(MIN_ROWS) @Max(MAX_ROWS)
  rows?: number;
}
