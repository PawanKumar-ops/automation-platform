import {
  BadRequestException, ConflictException, Injectable, HttpException, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { UsersService, normalizeEmail } from '../users/users.service';
import { EmailOtp } from './schemas/email-otp.schema/email-otp.schema';
import { RefreshSession } from './schemas/refresh-session.schema/refresh-session.schema';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_RESET_RESPONSE = { message: 'If an account exists for this email, a reset code has been sent.' };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectModel(EmailOtp.name) private readonly otps: Model<EmailOtp>,
    @InjectModel(RefreshSession.name) private readonly sessions: Model<RefreshSession>,
  ) {}

  async signup(input: { name: string; email: string; password: string }) {
    const email = normalizeEmail(input.email);
    if (await this.users.findByEmail(email)) throw new ConflictException('An account with this email already exists');
    if (input.name.trim().length === 0) throw new BadRequestException('Name is required');
    let user;
    try {
      user = await this.users.create({ name: input.name.trim(), email, passwordHash: await argon2.hash(input.password) });
    } catch (error) {
      if (isDuplicateKey(error)) throw new ConflictException('An account with this email already exists');
      throw error;
    }
    try {
      await this.sendOtp(user.id, user.email, user.name, 'verification');
      return { message: 'Account created. Check your email for a verification code.', email: user.email };
    } catch (error) {
      // Keep the account so a temporary mail outage does not turn signup into a lost request.
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) throw error;
      return {
        message: 'Account created, but the verification email could not be sent. Use Resend code to try again.',
        email: user.email,
        verificationEmailSent: false,
      };
    }
  }

  async verifyEmail(emailInput: string, code: string) {
    const user = await this.users.findByEmail(emailInput);
    if (!user) throw new UnauthorizedException('Invalid or expired code');
    if (user.isEmailVerified) return this.issueTokens(user.id);
    await this.validateOtp(user.id, 'verification', code);
    await this.users.markVerified(user.id);
    await this.otps.deleteOne({ userId: user._id, purpose: 'verification' }).exec();
    return this.issueTokens(user.id);
  }

  async resendOtp(emailInput: string, purpose: 'verification' | 'password-reset') {
    const user = await this.users.findByEmail(emailInput);
    if (!user || (purpose === 'verification' && user.isEmailVerified)) {
      return { message: purpose === 'verification' ? 'If verification is needed, a code has been sent.' : GENERIC_RESET_RESPONSE.message };
    }
    try {
      await this.sendOtp(user.id, user.email, user.name, purpose);
      return { message: 'A new code has been sent.' };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) throw error;
      return { message: 'If verification is needed, a code has been sent.' };
    }
  }

  async signin(emailInput: string, password: string) {
    const user = await this.users.findByEmail(emailInput, true);
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('Invalid email or password');
    if (!user.isEmailVerified) throw new UnauthorizedException('Please verify your email before signing in');
    return this.issueTokens(user.id);
  }

  async forgotPassword(emailInput: string) {
    const user = await this.users.findByEmail(emailInput);
    if (user) await this.sendOtp(user.id, user.email, user.name, 'password-reset');
    return GENERIC_RESET_RESPONSE;
  }

  async resetPassword(emailInput: string, code: string, password: string) {
    const user = await this.users.findByEmail(emailInput);
    if (!user) throw new UnauthorizedException('Invalid or expired code');
    await this.validateOtp(user.id, 'password-reset', code);
    await this.users.updatePassword(user.id, await argon2.hash(password));
    await Promise.all([
      this.otps.deleteOne({ userId: user._id, purpose: 'password-reset' }).exec(),
      this.sessions.updateMany({ userId: user._id }, { revoked: true }).exec(),
    ]);
    return { message: 'Password updated. Please sign in again.' };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; sid: string; type: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh' || !Types.ObjectId.isValid(payload.sub) || !Types.ObjectId.isValid(payload.sid)) throw new UnauthorizedException('Invalid refresh token');
    const session = await this.sessions.findOne({ _id: payload.sid, userId: payload.sub, revoked: false }).select('+tokenHash').exec();
    if (!session || session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Session expired');
    if (!safeEqual(session.tokenHash, hashToken(refreshToken))) {
      await this.sessions.updateOne({ _id: session._id }, { revoked: true }).exec();
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.users.findById(payload.sub);
    if (!user?.isEmailVerified) throw new UnauthorizedException('Account unavailable');
    const next = await this.makeTokenPair(user.id, session.id);
    const result = await this.sessions.updateOne(
      { _id: session._id, revoked: false, tokenHash: session.tokenHash },
      { tokenHash: hashToken(next.refreshToken), expiresAt: this.refreshExpiresAt() },
    ).exec();
    if (result.modifiedCount !== 1) throw new UnauthorizedException('Session already rotated');
    return next;
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<{ sid: string; type: string }>(refreshToken, {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), ignoreExpiration: true,
        });
        if (payload.type === 'refresh' && Types.ObjectId.isValid(payload.sid)) {
          const session = await this.sessions.findById(payload.sid).select('+tokenHash').exec();
          if (session && safeEqual(session.tokenHash, hashToken(refreshToken))) session.revoked = true, await session.save();
        }
      } catch { /* Logging out an expired or invalid token is idempotent. */ }
    }
    return { message: 'Logged out.' };
  }

  private async issueTokens(userId: string) {
    const sessionId = new Types.ObjectId().toString();
    const tokens = await this.makeTokenPair(userId, sessionId);
    await this.sessions.create({
      _id: sessionId, userId: new Types.ObjectId(userId), tokenHash: hashToken(tokens.refreshToken),
      expiresAt: this.refreshExpiresAt(),
    });
    return tokens;
  }

  private async makeTokenPair(userId: string, sessionId: string) {
    const refreshExpiry = this.config.get<string>('JWT_REFRESH_EXPIRY')?.trim() || '7d';
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ sub: userId, type: 'access' }, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '15m',
      }),
      this.jwt.signAsync({ sub: userId, sid: sessionId, type: 'refresh', jti: randomUUID() }, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: refreshExpiry as `${number}${'s' | 'm' | 'h' | 'd'}`,
      }),
    ]);
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL_SECONDS };
  }

  private refreshExpiresAt(): Date {
    const expiry = this.config.get<string>('JWT_REFRESH_EXPIRY')?.trim() || '7d';
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) return new Date(Date.now() + REFRESH_TTL_MS);
    const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
    return new Date(Date.now() + Number(match[1]) * unitMs);
  }

  private async sendOtp(userId: string, email: string, name: string, purpose: 'verification' | 'password-reset') {
    const existing = await this.otps.findOne({ userId, purpose }).exec();
    if (existing && Date.now() - existing.lastSentAt.getTime() < OTP_COOLDOWN_MS) {
      throw new HttpException('Please wait before requesting another code', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await argon2.hash(code);
    await this.otps.findOneAndUpdate(
      { userId, purpose },
      { userId, purpose, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, lastSentAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
    try {
      if (purpose === 'verification') await this.mail.sendVerification(email, name, code);
      else await this.mail.sendPasswordReset(email, name, code);
    } catch (error) {
      await this.otps.deleteOne({ userId, purpose, codeHash }).exec();
      throw error;
    }
  }

  private async validateOtp(userId: string, purpose: 'verification' | 'password-reset', code: string) {
    const otp = await this.otps.findOne({ userId, purpose }).select('+codeHash').exec();
    if (!otp || otp.expiresAt.getTime() <= Date.now() || otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (!(await argon2.verify(otp.codeHash, code))) {
      const result = await this.otps.updateOne(
        { _id: otp._id, attempts: { $lt: OTP_MAX_ATTEMPTS }, expiresAt: { $gt: new Date() } },
        { $inc: { attempts: 1 } },
      ).exec();
      if (result.modifiedCount !== 1) throw new UnauthorizedException('Invalid or expired code');
      throw new UnauthorizedException('Invalid or expired code');
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  return left.length === right.length && Buffer.from(left).equals(Buffer.from(right));
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: number }).code === 11000;
}
