import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsExportService } from './events-export.service';
import { SecurityGuard } from '../common/guards/security.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateEventoDto } from './dto/create-evento.dto';
import { UpdateEventoDto } from './dto/update-evento.dto';
import { ListEventosQueryDto } from './dto/list-eventos-query.dto';
import { ExportEmailDto } from './dto/export-email.dto';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly eventsExportService: EventsExportService,
  ) {}

  // Export .ics (download) — precisa vir antes de GET ':id'
  @UseGuards(SecurityGuard)
  @Roles('USER', 'ADMIN')
  @Get('export.ics')
  @Header('Content-Type', 'text/calendar; charset="UTF-8"')
  @Header('Content-Disposition', 'attachment; filename="eventos.ics"')
  @HttpCode(HttpStatus.OK)
  async exportICS(@Query() query: ListEventosQueryDto) {
    const eventos = await this.eventsExportService.findForExport(query.mes, query.ano);
    return this.eventsExportService.buildICS(eventos);
  }

  // Envia e-mail com anexo .ics para importar no celular
  @UseGuards(SecurityGuard)
  @Roles('USER', 'ADMIN')
  @Post('export-email')
  @HttpCode(HttpStatus.OK)
  async exportEmail(@Body() dto: ExportEmailDto) {
    return this.eventsExportService.sendExportEmail(dto.destination, dto.mes, dto.ano);
  }

  @UseGuards(SecurityGuard)
  @Roles('USER', 'ADMIN')
  @Get()
  async findAll(@Query() query: ListEventosQueryDto) {
    return this.eventsService.findAll(query);
  }

  @UseGuards(SecurityGuard)
  @Roles('USER', 'ADMIN')
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.findOne(id);
  }

  @UseGuards(SecurityGuard)
  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateEventoDto, @Request() req: any) {
    const createdBy = req?.user?.userId as string | undefined;
    return this.eventsService.create(dto, createdBy);
  }

  @UseGuards(SecurityGuard)
  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventoDto,
  ) {
    return this.eventsService.update(id, dto);
  }

  @UseGuards(SecurityGuard)
  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.remove(id);
  }
}
