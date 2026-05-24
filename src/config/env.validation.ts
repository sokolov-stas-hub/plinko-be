import { plainToInstance, Transform } from 'class-transformer';
import { IsEnum, IsInt, IsString, MinLength, validateSync } from 'class-validator';

export class EnvSchema {
  @IsString() @MinLength(1)
  DATABASE_URL!: string;

  @IsString() @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString() @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString() JWT_ACCESS_TTL!: string;
  @IsString() JWT_REFRESH_TTL!: string;

  @Transform(({ value }) => BigInt(value))
  MIN_BET!: bigint;

  @Transform(({ value }) => BigInt(value))
  MAX_BET!: bigint;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  PORT!: number;

  @IsEnum(['development', 'test', 'production'])
  NODE_ENV!: 'development' | 'test' | 'production';

  @IsString() @MinLength(1)
  AVATAR_STORAGE_ENDPOINT!: string;

  @IsString() @MinLength(1)
  AVATAR_STORAGE_REGION!: string;

  @IsString() @MinLength(1)
  AVATAR_STORAGE_BUCKET!: string;

  @IsString() @MinLength(1)
  AVATAR_STORAGE_ACCESS_KEY_ID!: string;

  @IsString() @MinLength(1)
  AVATAR_STORAGE_SECRET_ACCESS_KEY!: string;

  @IsString() @MinLength(1)
  AVATAR_PUBLIC_BASE_URL!: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  const instance = plainToInstance(EnvSchema, raw, { enableImplicitConversion: false });
  const errors = validateSync(instance, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(`Env validation failed:\n${errors.map((e) => e.toString()).join('\n')}`);
  }
  return instance;
}
