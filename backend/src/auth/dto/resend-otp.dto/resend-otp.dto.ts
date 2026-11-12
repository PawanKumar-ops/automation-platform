import { IsEmail, IsIn } from 'class-validator';

export class ResendOtpDto {
  @IsEmail() email!: string;
  @IsIn(['verification', 'password-reset']) purpose!: 'verification' | 'password-reset';
}
