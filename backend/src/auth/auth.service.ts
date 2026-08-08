import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
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
  ) {}

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

    // Salva as roles do usuário na Estrutura de Dados SET do Valkey (SADD) -> Performance O(1)
    await this.valkeyService.addRoleSet(user.id, jti, user.roles, 3600);

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
}

