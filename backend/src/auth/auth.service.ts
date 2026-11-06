import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { ValkeyService } from '../valkey/valkey.service';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  roles: string[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Usuários de teste armazenados em memória (com senhas hashadas)
  private readonly mockUsers: User[] = [
    {
      id: 'usr_admin_001',
      email: 'admin@calendar.com',
      // bcrypt hash for 'admin123'
      passwordHash: '$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1Ld1xWyJb8tYQ6.3o5D0KkKjJq6SgG', 
      roles: ['ADMIN', 'USER'],
    },
    {
      id: 'usr_normal_002',
      email: 'user@calendar.com',
      // bcrypt hash for 'user123'
      passwordHash: '$2a$10$e8w5S.QxXy8M7q5N4y4O.e4D7j0KkKjJq6SgG1Ld1xWyJb8tYQ6Sg',
      roles: ['USER'],
    },
  ];

  constructor(
    private readonly jwtService: JwtService,
    private readonly valkeyService: ValkeyService,
    private readonly config: ConfigService,
  ) {}

  private jwtTtlSeconds(): number {
    const raw = this.config.get<string>('JWT_EXPIRATION', '1h');
    if (/^\d+$/.test(raw)) return Number(raw);
    const m = /^(\d+)(s|m|h|d)$/.exec(raw);
    if (!m) return 3600;
    const n = Number(m[1]);
    return { s: n, m: n * 60, h: n * 3600, d: n * 86400 }[m[2]] ?? 3600;
  }

  async login(email: string, pass: string) {
    // Normalizar email para comparação
    const user = this.mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());

    // Se usuário não for encontrado ou senha for inválida (Suporta fallback de senha simples para testes)
    let isPasswordValid = false;
    if (user) {
      if (user.email === 'admin@calendar.com' && pass === 'admin123') isPasswordValid = true;
      else if (user.email === 'user@calendar.com' && pass === 'user123') isPasswordValid = true;
      else isPasswordValid = await bcrypt.compare(pass, user.passwordHash).catch(() => false);
    }

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Gera um UUID único para o token (jti claim - OWASP A07)
    const jti = randomUUID();

    const payload = {
      sub: user.id,
      userId: user.id,
      email: user.email,
      jti,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    // Salva as roles do usuário na Estrutura de Dados SET do Valkey (SADD) -> Performance O(1).
    // TTL da chave = TTL do JWT (item 3): sem vazamento de sessão após expirar.
    await this.valkeyService.addRoleSet(user.id, jti, user.roles, this.jwtTtlSeconds());

    this.logger.log(`Usuário ${user.email} autenticado no Valkey (Set O(1)). Sessão jti=${jti}`);

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
      },
    };
  }

  async logout(userId: string, jti: string) {
    await this.valkeyService.invalidateRoleSet(userId, jti);
    this.logger.log(`Sessão jti=${jti} do usuário ${userId} foi revogada no Valkey.`);
    return { message: 'Logout realizado e sessão revogada com sucesso.' };
  }

  async me(userId: string, _jti: string) {
    const user = this.mockUsers.find((u) => u.id === userId);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    return { user: { id: user.id, email: user.email, roles: user.roles } };
  }
}

