import { IsString, Length } from 'class-validator';

export class UpdateClientSeedDto {
  @IsString() @Length(1, 64)
  clientSeed!: string;
}
