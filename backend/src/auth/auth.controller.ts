import { Controller, Post, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SecurityGuard } from '../common/guards/security.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    return this.authService.login(body.email || '', body.password || '');
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(SecurityGuard)
  @Post('logout')
  async logout(@Request() req: any) {
    const { userId, jti } = req.user;
    return this.authService.logout(userId, jti);
  }
}
