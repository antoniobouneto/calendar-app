import { Module, Global } from '@nestjs/common';
import { ValkeyService } from './valkey.service';

@Global()
@Module({
  providers: [ValkeyService],
  exports: [ValkeyService],
})
export class ValkeyModule {}
