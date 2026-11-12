import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user/current-user.decorator';
import type { AuthenticatedRequestUser } from './decorators/current-user/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto/forgot-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto/refresh-token.dto';
import { ResendOtpDto } from './dto/resend-otp.dto/resend-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto/reset-password.dto';
import { SigninDto } from './dto/signin.dto/signin.dto';
import { SignupDto } from './dto/signup.dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService) {}

  @Post('signup') signup(@Body() dto: SignupDto) { return this.auth.signup(dto); }
  @Post('verify-email') verifyEmail(@Body() dto: VerifyEmailDto) { return this.auth.verifyEmail(dto.email, dto.code); }
  @Post('resend-otp') resendOtp(@Body() dto: ResendOtpDto) { return this.auth.resendOtp(dto.email, dto.purpose); }
  @Post('signin') signin(@Body() dto: SigninDto) { return this.auth.signin(dto.email, dto.password); }
  @Post('forgot-password') forgotPassword(@Body() dto: ForgotPasswordDto) { return this.auth.forgotPassword(dto.email); }
  @Post('reset-password') resetPassword(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto.email, dto.code, dto.password); }

  @Post('refresh') @HttpCode(200)
  refresh(@Body() dto: RefreshTokenDto) { return this.auth.refresh(dto.refreshToken); }

  @Post('logout') @HttpCode(200)
  logout(@Body() dto: RefreshTokenDto) { return this.auth.logout(dto.refreshToken); }

  @Get('me') @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedRequestUser) { return this.users.profile(user.userId); }
}
