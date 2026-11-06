import { Injectable, OnModuleInit, OnModuleDestroy, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Fail-closed by default (review item 1):
 * - VALKEY_ALLOW_MEMORY_FALLBACK=true reproduz o fallback anterior (dev/teste apenas).
 * - Fora disso, Valkey indisponível => ServiceUnavailableException (503),
 *   nunca autentica silenciosamente numa memória local não compartilhada.
 */
@Injectable()
export class ValkeyService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly config: ConfigService) {}
  private readonly logger = new Logger(ValkeyService.name);
  private client: Redis | null = null;
  private isValkeyConnected = false;

  private get allowMemoryFallback(): boolean {
    return this.config.get<string>('VALKEY_ALLOW_MEMORY_FALLBACK') === 'true';
  }

  isReady(): boolean {
    return this.isValkeyConnected || this.allowMemoryFallback;
  }

  private unavailable(msg: string): ServiceUnavailableException {
    this.logger.error(`${msg} (Valkey indisponível e fallback em memória desativado)`);
    return new ServiceUnavailableException('Service temporarily unavailable: session store offline');
  }

  // Fallback em Memória utilizando Data Structure Set do JavaScript (Complexidade O(1))
  private inMemorySets = new Map<string, { rolesSet: Set<string>; expiresAt?: number }>();

  onModuleInit() {
    const host = this.config.get<string>('VALKEY_HOST', 'localhost');
    const port = Number(this.config.get<string>('VALKEY_PORT', '6379'));

    try {
      this.client = new Redis({
        host,
        port,
        retryStrategy: () => null,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      this.client
        .connect()
        .then(() => {
          this.isValkeyConnected = true;
          this.logger.log(`⚡ Conectado ao Valkey (O(1) Set Store) em ${host}:${port}`);
        })
        .catch(() => {
          this.isValkeyConnected = false;
          if (this.allowMemoryFallback) {
            this.logger.warn(`Valkey não encontrado em ${host}:${port}. Fallback O(1) em memória local ATIVADO (VALKEY_ALLOW_MEMORY_FALLBACK=true).`);
          } else {
            this.logger.error(`Valkey não encontrado em ${host}:${port}. Fallback DESATIVADO — operando fail-closed (503 nas rotas protegidas). Defina VALKEY_ALLOW_MEMORY_FALLBACK=true apenas em dev/teste.`);
          }
        });
    } catch {
      this.isValkeyConnected = false;
      if (this.allowMemoryFallback) {
        this.logger.warn('Modo Fallback O(1) em Memória ativado para o Valkey.');
      } else {
        this.logger.error('Valkey indisponível e fallback desativado — operando fail-closed.');
      }
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  /**
   * Adiciona um conjunto de roles/permissões ao Set do Valkey usando SADD.
   * Operação O(N) para inserção de N itens, com busca posterior O(1).
   */
  async addRoleSet(userId: string, tokenUuid: string, roles: string[], ttlSeconds: number = 3600): Promise<void> {
    const key = `session:roles:${userId}:${tokenUuid}`;
    const userKey = `user:sessions:${userId}`;

    if (this.isValkeyConnected && this.client) {
      try {
        if (roles.length > 0) {
          // Utiliza a estrutura de dados SET do Valkey (SADD)
          await this.client.sadd(key, ...roles);
          await this.client.expire(key, ttlSeconds);
          // Índice auxiliar por usuário (revogar todas as sessões sem SCAN) — item 3
          await this.client.sadd(userKey, tokenUuid);
          await this.client.expire(userKey, ttlSeconds);
        }
        return;
      } catch (err) {
        this.logger.warn(`Erro no Valkey ao executar SADD: ${err.message}`);
        this.isValkeyConnected = false;
        // caiu de repente: fail-closed salvo dev/teste
        if (!this.allowMemoryFallback) return Promise.reject(this.unavailable('Erro no Valkey ao criar sessão'));
      }
    }

    if (!this.isValkeyConnected && !this.allowMemoryFallback) {
      throw this.unavailable('Valkey indisponível ao criar sessão');
    }

    // Fallback em Memória usando JavaScript Set (Busca O(1)) — dev/teste apenas
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.inMemorySets.set(key, { rolesSet: new Set(roles), expiresAt });
    this.inMemorySets.set(userKey, { rolesSet: new Set([tokenUuid]), expiresAt });
  }

  /**
   * Verifica se uma role específica existe no Set do Valkey usando SISMEMBER.
   * Complexidade Matemática: O(1) constante!
   */
  async hasRoleInSet(userId: string, tokenUuid: string, role: string): Promise<boolean> {
    const key = `session:roles:${userId}:${tokenUuid}`;

    if (this.isValkeyConnected && this.client) {
      try {
        // Comando SISMEMBER do Valkey -> O(1) constant time
        const exists = await this.client.sismember(key, role);
        return exists === 1;
      } catch (err) {
        this.logger.warn(`Erro no Valkey ao executar SISMEMBER: ${err.message}`);
        this.isValkeyConnected = false;
        if (!this.allowMemoryFallback) throw this.unavailable('Valkey indisponível ao validar sessão');
      }
    }

    if (!this.isValkeyConnected && !this.allowMemoryFallback) {
      throw this.unavailable('Valkey indisponível ao validar sessão');
    }

    // Fallback em Memória usando Set.has() -> O(1)
    const item = this.inMemorySets.get(key);
    if (!item) return false;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.inMemorySets.delete(key);
      return false;
    }

    return item.rolesSet.has(role);
  }

  /**
   * Remove o Set de sessão do Valkey (Logout / Revogação).
   * Também remove o jti do índice auxiliar user:sessions:<userId>.
   */
  async invalidateRoleSet(userId: string, tokenUuid: string): Promise<void> {
    const key = `session:roles:${userId}:${tokenUuid}`;
    const userKey = `user:sessions:${userId}`;

    if (this.isValkeyConnected && this.client) {
      try {
        await this.client.del(key);
        await this.client.srem(userKey, tokenUuid);
      } catch (err) {
        this.logger.warn(`Erro no Valkey ao deletar chave: ${err.message}`);
        this.isValkeyConnected = false;
        if (!this.allowMemoryFallback) throw this.unavailable('Valkey indisponível ao revogar sessão');
      }
    }

    if (!this.isValkeyConnected && !this.allowMemoryFallback) {
      throw this.unavailable('Valkey indisponível ao revogar sessão');
    }

    this.inMemorySets.delete(key);
    const idx = this.inMemorySets.get(userKey);
    if (idx) idx.rolesSet.delete(tokenUuid);
  }

  /** Revoga TODAS as sessões de um usuário (logout global / troca de role) — item 3. */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    const userKey = `user:sessions:${userId}`;
    if (this.isValkeyConnected && this.client) {
      try {
        const jtis = await this.client.smembers(userKey);
        for (const jti of jtis) await this.client.del(`session:roles:${userId}:${jti}`);
        await this.client.del(userKey);
        return;
      } catch (err) {
        this.logger.warn(`Erro ao revogar sessões do usuário: ${err.message}`);
        this.isValkeyConnected = false;
        if (!this.allowMemoryFallback) throw this.unavailable('Valkey indisponível ao revogar sessões');
      }
    }
    if (!this.isValkeyConnected && !this.allowMemoryFallback) {
      throw this.unavailable('Valkey indisponível ao revogar sessões');
    }
    const idx = this.inMemorySets.get(userKey);
    if (idx) for (const jti of idx.rolesSet) this.inMemorySets.delete(`session:roles:${userId}:${jti}`);
    this.inMemorySets.delete(userKey);
  }
}
