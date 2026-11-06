import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ValkeyService } from './valkey.service';

describe('ValkeyService', () => {
  let service: ValkeyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ VALKEY_ALLOW_MEMORY_FALLBACK: 'true' })],
        }),
      ],
      providers: [ValkeyService],
    }).compile();

    service = module.get<ValkeyService>(ValkeyService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('deve adicionar papéis ao Set do Valkey (SADD) e verificar existência em O(1) (SISMEMBER)', async () => {
    const userId = 'user_123';
    const jti = 'session_uuid_abc';
    const roles = ['ADMIN', 'USER'];

    await service.addRoleSet(userId, jti, roles, 60);

    const hasAdmin = await service.hasRoleInSet(userId, jti, 'ADMIN');
    const hasUser = await service.hasRoleInSet(userId, jti, 'USER');
    const hasManager = await service.hasRoleInSet(userId, jti, 'MANAGER');

    expect(hasAdmin).toBe(true);
    expect(hasUser).toBe(true);
    expect(hasManager).toBe(false);
  });

  it('deve remover o Set do Valkey na invalidação de sessão', async () => {
    const userId = 'user_123';
    const jti = 'session_uuid_abc';

    await service.addRoleSet(userId, jti, ['ADMIN'], 60);
    await service.invalidateRoleSet(userId, jti);

    const hasAdmin = await service.hasRoleInSet(userId, jti, 'ADMIN');
    expect(hasAdmin).toBe(false);
  });
});
