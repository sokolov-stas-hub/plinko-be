import { IsEmail, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email!: string;

  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'password must contain a letter and a digit' })
  password!: string;
}
