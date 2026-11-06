import { Controller, Post, Get, Body, UseGuards, Request, Response, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SecurityGuard } from '../common/guards/security.guard';

/**
 * Token storage (item 4): o JWT vive num cookie httpOnly + SameSite=Lax,
 * invisível ao JavaScript (protege contra roubo via XSS).
 * O frontend guarda apenas o perfil (email/roles), nunca o token.
 * Bearer continua aceito por clientes API (mobile, testes).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() body: { email?: string; password?: string },
    @Response({ passthrough: true }) res: any,
  ) {
    const result = await this.authService.login(body.email || '', body.password || '');
    const secure = process.env.NODE_ENV === 'production';
    res.cookie('calendar_jwt', (result as any).access_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 60 * 60 * 1000, // 1h = JWT_EXPIRATION
    });
    return result;
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(SecurityGuard)
  @Post('logout')
  async logout(@Request() req: any, @Response({ passthrough: true }) res: any) {
    const { userId, jti } = req.user;
    res.clearCookie('calendar_jwt', { path: '/' });
    return this.authService.logout(userId, jti);
  }

  /** Sessão atual a partir do cookie/Bearer — o frontend usa no reload sem localStorage. */
  @UseGuards(SecurityGuard)
  @Get('me')
  async me(@Request() req: any) {
    return this.authService.me(req.user.userId, req.user.jti);
  }
}
