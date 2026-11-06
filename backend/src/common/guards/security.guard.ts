import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ValkeyService } from '../../valkey/valkey.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly valkeyService: ValkeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token de autenticação não fornecido');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'super-secret-calendar-key-owasp',
      });
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const { userId, jti } = payload;
    if (!userId || !jti) {
      throw new UnauthorizedException('Payload do token inválido');
    }

    // Se nenhuma role específica for exigida, verifica apenas se o usuário tem a permissão genérica 'USER' no Valkey Set (O(1))
    const rolesToCheck = requiredRoles && requiredRoles.length > 0 ? requiredRoles : ['USER', 'ADMIN'];

    // Validação O(1) de permissão / revogação no Valkey via SISMEMBER.
    // Fail-closed: Valkey fora (sem fallback dev) vira 503, nunca 403/401
    // mascarado — o chamador precisa saber que a infra falhou, item 1.
    let hasPermission = false;
    try {
      for (const role of rolesToCheck) {
        const isMember = await this.valkeyService.hasRoleInSet(userId, jti, role);
        if (isMember) {
          hasPermission = true;
          break;
        }
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException('Service temporarily unavailable: session store offline');
    }

    if (!hasPermission) {
      if (!requiredRoles || requiredRoles.length === 0) {
        throw new UnauthorizedException('Sessão inválida ou revogada no Valkey');
      }
      throw new ForbiddenException('Acesso negado: privilégios insuficientes (Valkey RBAC)');
    }

    request['user'] = { userId, jti };
    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    // Preferência: cookie httpOnly (frontend). Fallback: Bearer (API/mobile) — item 4.
    const fromCookie = request.cookies?.calendar_jwt;
    if (fromCookie) return fromCookie;
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

