import { IsString, MinLength } from 'class-validator';
export class LogoutDto { @IsString() @MinLength(10) refreshToken!: string; }
