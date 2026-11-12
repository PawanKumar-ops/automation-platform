import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SigninDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
