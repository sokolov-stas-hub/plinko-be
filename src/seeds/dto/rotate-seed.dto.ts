import { IsOptional, IsString, Length } from 'class-validator';

export class RotateSeedDto {
  @IsOptional() @IsString() @Length(1, 64)
  newClientSeed?: string;
}
