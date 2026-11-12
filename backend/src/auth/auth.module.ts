import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { EmailOtp, EmailOtpSchema } from './schemas/email-otp.schema/email-otp.schema';
import { RefreshSession, RefreshSessionSchema } from './schemas/refresh-session.schema/refresh-session.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: EmailOtp.name, schema: EmailOtpSchema },
      { name: RefreshSession.name, schema: RefreshSessionSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
})
export class AuthModule {}
