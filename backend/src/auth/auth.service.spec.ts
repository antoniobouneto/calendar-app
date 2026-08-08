import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ValkeyService } from '../valkey/valkey.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let valkeyService: ValkeyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
          },
        },
        {
          provide: ValkeyService,
          useValue: {
            addRoleSet: jest.fn().mockResolvedValue(undefined),
            invalidateRoleSet: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    valkeyService = module.get<ValkeyService>(ValkeyService);
  });

  it('deve fazer login com sucesso e registrar o Set no Valkey (SADD O(1))', async () => {
    const result = await service.login('admin@calendar.com', 'admin123');
    expect(result).toHaveProperty('access_token');
    expect(result.user.roles).toContain('ADMIN');
    expect(valkeyService.addRoleSet).toHaveBeenCalled();
  });

  it('deve rejeitar senhas incorretas', async () => {
    await expect(service.login('admin@calendar.com', 'senha_errada')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('deve realizar logout e remover o Set no Valkey', async () => {
    const response = await service.logout('usr_admin_001', 'jti-uuid-123');
    expect(response.message).toContain('Logout');
    expect(valkeyService.invalidateRoleSet).toHaveBeenCalledWith('usr_admin_001', 'jti-uuid-123');
  });
});

