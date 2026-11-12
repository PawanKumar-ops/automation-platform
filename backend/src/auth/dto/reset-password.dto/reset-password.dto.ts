import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail() email!: string;
  @Matches(/^\d{6}$/) code!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
