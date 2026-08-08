import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class ValkeyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ValkeyService.name);
  private client: Redis | null = null;
  private isValkeyConnected = false;

  // Fallback em Memória utilizando Data Structure Set do JavaScript (Complexidade O(1))
  private inMemorySets = new Map<string, { rolesSet: Set<string>; expiresAt?: number }>();

  onModuleInit() {
    const host = process.env.VALKEY_HOST || process.env.REDIS_HOST || 'localhost';
    const port = Number(process.env.VALKEY_PORT) || Number(process.env.REDIS_PORT) || 6379;

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
          this.logger.warn(`Valkey não encontrado em ${host}:${port}. Ativando Fallback O(1) em memória local.`);
        });
    } catch {
      this.isValkeyConnected = false;
      this.logger.warn('Modo Fallback O(1) em Memória ativado para o Valkey.');
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

    if (this.isValkeyConnected && this.client) {
      try {
        if (roles.length > 0) {
          // Utiliza a estrutura de dados SET do Valkey (SADD)
          await this.client.sadd(key, ...roles);
          await this.client.expire(key, ttlSeconds);
        }
        return;
      } catch (err) {
        this.logger.warn(`Erro no Valkey ao executar SADD. Alternando para memória local: ${err.message}`);
        this.isValkeyConnected = false;
      }
    }

    // Fallback em Memória usando JavaScript Set (Busca O(1))
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.inMemorySets.set(key, { rolesSet: new Set(roles), expiresAt });
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
      }
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
   */
  async invalidateRoleSet(userId: string, tokenUuid: string): Promise<void> {
    const key = `session:roles:${userId}:${tokenUuid}`;

    if (this.isValkeyConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (err) {
        this.logger.warn(`Erro no Valkey ao deletar chave: ${err.message}`);
      }
    }

    this.inMemorySets.delete(key);
  }
}
