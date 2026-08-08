import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isRedisConnected = false;
  private inMemoryFallback = new Map<string, { value: string; expiresAt?: number }>();

  onModuleInit() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = Number(process.env.REDIS_PORT) || 6379;

    try {
      this.client = new Redis({
        host,
        port,
        retryStrategy: () => null, // Don't keep retrying if Redis is not running
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      this.client
        .connect()
        .then(() => {
          this.isRedisConnected = true;
          this.logger.log(`Conectado ao Redis em ${host}:${port}`);
        })
        .catch(() => {
          this.isRedisConnected = false;
          this.logger.warn(`Redis não encontrado em ${host}:${port}. Usando armazenamento em memória como fallback.`);
        });
    } catch {
      this.isRedisConnected = false;
      this.logger.warn('Modo Fallback em Memória ativado para o Redis.');
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  async setSession(userId: string, tokenUuid: string, data: any, ttlSeconds: number = 3600): Promise<void> {
    const key = `session:${userId}:${tokenUuid}`;
    const value = JSON.stringify(data);

    if (this.isRedisConnected && this.client) {
      try {
        await this.client.set(key, value, 'EX', ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn(`Erro no Redis. Alternando para memória local: ${err.message}`);
        this.isRedisConnected = false;
      }
    }

    // Fallback em Memória
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.inMemoryFallback.set(key, { value, expiresAt });
  }

  async getSession(userId: string, tokenUuid: string): Promise<any | null> {
    const key = `session:${userId}:${tokenUuid}`;

    if (this.isRedisConnected && this.client) {
      try {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
      } catch (err) {
        this.logger.warn(`Erro ao ler do Redis. Buscando da memória local: ${err.message}`);
        this.isRedisConnected = false;
      }
    }

    // Fallback em Memória
    const item = this.inMemoryFallback.get(key);
    if (!item) return null;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.inMemoryFallback.delete(key);
      return null;
    }

    return JSON.parse(item.value);
  }

  async invalidateSession(userId: string, tokenUuid: string): Promise<void> {
    const key = `session:${userId}:${tokenUuid}`;

    if (this.isRedisConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (err) {
        this.logger.warn(`Erro ao deletar do Redis: ${err.message}`);
      }
    }

    this.inMemoryFallback.delete(key);
  }
}
