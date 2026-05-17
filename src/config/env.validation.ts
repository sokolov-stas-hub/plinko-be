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
}

export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  const instance = plainToInstance(EnvSchema, raw, { enableImplicitConversion: false });
  const errors = validateSync(instance, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(`Env validation failed:\n${errors.map((e) => e.toString()).join('\n')}`);
  }
  return instance;
}
