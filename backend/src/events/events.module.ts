import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoEntity } from './entities/evento.entity';
import { EventoPontualEntity } from './entities/evento-pontual.entity';
import { EventoRecorrenteEntity } from './entities/evento-recorrente.entity';
import { EventsService } from './events.service';
import { EventsExportService } from './events-export.service';
import { EventsController } from './events.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventoEntity,
      EventoPontualEntity,
      EventoRecorrenteEntity,
    ]),
  ],
  controllers: [EventsController],
  providers: [EventsService, EventsExportService],
  exports: [EventsService, EventsExportService],
})
export class EventsModule implements OnModuleInit {
  private readonly logger = new Logger(EventsModule.name);

  constructor(private readonly eventsService: EventsService) {}

  async onModuleInit() {
    try {
      await this.eventsService.seedIfEmpty();
    } catch (err) {
      this.logger.error(`Seed de eventos falhou: ${err.message}`);
    }
  }
}
