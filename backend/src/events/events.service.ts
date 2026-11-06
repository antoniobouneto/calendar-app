import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { EventoEntity } from './entities/evento.entity';
import { EventoPontualEntity } from './entities/evento-pontual.entity';
import { EventoRecorrenteEntity } from './entities/evento-recorrente.entity';
import { EnumFrequencia, TipoEvento } from './entities/enum-frequencia';
import { CreateEventoDto } from './dto/create-evento.dto';
import { UpdateEventoDto } from './dto/update-evento.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(EventoEntity)
    private readonly eventoRepository: Repository<EventoEntity>,
  ) {}

  /** Formato de saída compatível com o frontend legado ({id,title,date})
   *  + formato da especificação ({titulo,dataInicio,dataFim,...}) */
  format(evento: EventoEntity) {
    const rec = evento as EventoRecorrenteEntity;
    const recFim = rec?.dataFimRecorrencia;
    const tipo = rec instanceof EventoRecorrenteEntity ? TipoEvento.RECORRENTE : TipoEvento.PONTUAL;

    return {
      id: evento.id,
      // legado (frontend atual)
      title: evento.titulo,
      date: evento.dataInicio instanceof Date
        ? evento.dataInicio.toISOString()
        : new Date(evento.dataInicio).toISOString(),
      // especificação
      titulo: evento.titulo,
      descricao: evento.descricao ?? null,
      dataInicio:
        evento.dataInicio instanceof Date
          ? evento.dataInicio.toISOString()
          : evento.dataInicio,
      dataFim:
        evento.dataFim instanceof Date
          ? evento.dataFim.toISOString()
          : evento.dataFim,
      diaInteiro: evento.diaInteiro,
      tipo,
      frequencia: rec?.frequencia ?? null,
      dataFimRecorrencia:
        recFim instanceof Date
          ? recFim.toISOString()
          : (recFim ?? null),
      usuarioId: evento.usuarioId ?? null,
      criadoEm: evento.criadoEm ?? null,
    };
  }

  /**
   * Retorna eventos de um dia inteiro (00:00:00 → 23:59:59.999).
   * Inclui eventos que iniciam no dia OU que atravessam o dia
   * (dataInicio <= fimDia && dataFim >= inicioDia), ordenados por hora
   * de início — base da grade horária 00–23h da aba "Eventos do Dia".
   */
  async findByDay(data: string, usuarioId?: string) {
    const dia = new Date(`${data}T00:00:00.000`);
    if (isNaN(dia.getTime())) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const inicioDia = new Date(dia);
    inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date(dia);
    fimDia.setHours(23, 59, 59, 999);

    // Condição de sobreposição: inicio <= fimDia AND fim >= inicioDia.
    // Como o TypeORM não monta "OR" de intervalos num find() simples,
    // buscamos pelo range de início no dia + atravessam de dias anteriores
    // em uma queryBuilder explícita.
    const qb = this.eventoRepository.createQueryBuilder('e');
    qb.where('e.dataInicio <= :fimDia AND e.dataFim >= :inicioDia', {
      inicioDia,
      fimDia,
    });
    if (usuarioId) {
      qb.andWhere('e.usuarioId = :usuarioId', { usuarioId });
    }
    qb.orderBy('e.dataInicio', 'ASC');
    const eventos = await qb.getMany();
    return eventos.map((e) => this.format(e));
  }

  async findAll(
    query: { mes?: number; ano?: number; usuarioId?: string; data?: string } = {},
  ) {
    if (query.data) {
      return this.findByDay(query.data, query.usuarioId);
    }
    if (query.mes && query.ano) {
      const inicioMes = new Date(query.ano, query.mes - 1, 1, 0, 0, 0);
      const fimMes = new Date(query.ano, query.mes, 0, 23, 59, 59, 999);
      const where: any = { dataInicio: Between(inicioMes, fimMes) };
      if (query.usuarioId) where.usuarioId = query.usuarioId;
      const eventos = await this.eventoRepository.find({
        where,
        order: { dataInicio: 'ASC' },
      });
      return eventos.map((e) => this.format(e));
    }

    const where: any = {};
    if (query.usuarioId) where.usuarioId = query.usuarioId;
    const eventos = await this.eventoRepository.find({
      where,
      order: { dataInicio: 'ASC' },
    });
    return eventos.map((e) => this.format(e));
  }

  async findOne(id: number) {
    const evento = await this.eventoRepository.findOneBy({ id });
    if (!evento) throw new NotFoundException(`Evento ${id} não encontrado`);
    return this.format(evento);
  }

  async create(dto: CreateEventoDto, createdBy?: string) {
    const titulo = dto.titulo ?? dto.title;
    if (!titulo) {
      throw new BadRequestException('titulo/title é obrigatório');
    }

    const inicioStr = dto.dataInicio ?? dto.date;
    if (!inicioStr) {
      throw new BadRequestException('dataInicio/date é obrigatório');
    }

    const dataInicio = new Date(inicioStr);
    if (isNaN(dataInicio.getTime())) {
      throw new BadRequestException('dataInicio/date inválido');
    }

    let dataFim = dto.dataFim
      ? new Date(dto.dataFim)
      : new Date(dataInicio.getTime() + 60 * 60000);
    if (isNaN(dataFim.getTime())) {
      throw new BadRequestException('dataFim inválido');
    }

    const isRecorrente =
      dto.tipo === TipoEvento.RECORRENTE || !!dto.frequencia;

    // Normalização dia_inteiro: ocupa 00:00 → 23:59:59 do dia de início.
    // Permite a grade horária contrapor "Dia todo" vs horários específicos.
    let diaInteiro = dto.diaInteiro ?? false;
    if (diaInteiro) {
      const inicioDia = new Date(dataInicio);
      inicioDia.setHours(0, 0, 0, 0);
      const fimDia = new Date(dataInicio);
      fimDia.setHours(23, 59, 59, 999);
      dataInicio.setHours(0, 0, 0, 0);
      dataFim = fimDia;
    } else {
      // No modo horária, o fim deve ser estritamente depois do início.
      // Múltiplos eventos no mesmo dia são permitidos (sem UNIQUE de dia).
      if (dataFim.getTime() <= dataInicio.getTime()) {
        throw new BadRequestException(
          'dataFim deve ser posterior a dataInicio (escolha um horário de término válido)',
        );
      }
    }

    const base = {
      titulo,
      descricao: dto.descricao ?? dto.description ?? null,
      dataInicio,
      dataFim,
      diaInteiro,
      usuarioId: dto.usuarioId ?? createdBy ?? null,
    };

    let saved: EventoEntity;
    if (isRecorrente) {
      const entity = new EventoRecorrenteEntity();
      Object.assign(entity, base, {
        frequencia: dto.frequencia ?? EnumFrequencia.DIARIA,
        dataFimRecorrencia: dto.dataFimRecorrencia
          ? new Date(dto.dataFimRecorrencia)
          : null,
      });
      saved = await this.eventoRepository.save(entity);
    } else {
      const entity = new EventoPontualEntity();
      Object.assign(entity, base);
      saved = await this.eventoRepository.save(entity);
    }

    this.logger.log(`Evento ${saved.id} criado: "${saved.titulo}" (${isRecorrente ? 'RECORRENTE' : 'PONTUAL'})`);
    return this.format(saved);
  }

  async update(id: number, dto: UpdateEventoDto) {
    const evento = await this.eventoRepository.findOneBy({ id });
    if (!evento) throw new NotFoundException(`Evento ${id} não encontrado`);

    const patch: Partial<EventoEntity> & Record<string, any> = {};
    if (dto.titulo !== undefined || dto.title !== undefined) {
      patch.titulo = dto.titulo ?? dto.title;
    }
    if (dto.descricao !== undefined || dto.description !== undefined) {
      patch.descricao = dto.descricao ?? dto.description ?? null;
    }
    if (dto.dataInicio !== undefined || dto.date !== undefined) {
      patch.dataInicio = new Date(dto.dataInicio ?? dto.date!);
    }
    if (dto.dataFim !== undefined) {
      patch.dataFim = new Date(dto.dataFim);
    }
    if (dto.diaInteiro !== undefined) patch.diaInteiro = dto.diaInteiro;
    if (dto.usuarioId !== undefined) patch.usuarioId = dto.usuarioId;

    // Recorrência: só faz sentido se for recorrente
    if (dto.frequencia !== undefined && evento instanceof EventoRecorrenteEntity) {
      (evento as EventoRecorrenteEntity).frequencia = dto.frequencia;
    }
    if (
      dto.dataFimRecorrencia !== undefined &&
      evento instanceof EventoRecorrenteEntity
    ) {
      (evento as EventoRecorrenteEntity).dataFimRecorrencia = new Date(
        dto.dataFimRecorrencia,
      );
    }

    Object.assign(evento, patch);

    // Revalida o intervalo após o patch (grade horária).
    if (evento.diaInteiro) {
      const inicioDia = new Date(evento.dataInicio);
      inicioDia.setHours(0, 0, 0, 0);
      const fimDia = new Date(evento.dataInicio);
      fimDia.setHours(23, 59, 59, 999);
      evento.dataInicio = inicioDia;
      evento.dataFim = fimDia;
    } else if (
      new Date(evento.dataFim).getTime() <= new Date(evento.dataInicio).getTime()
    ) {
      throw new BadRequestException(
        'dataFim deve ser posterior a dataInicio (escolha um horário de término válido)',
      );
    }

    const saved = await this.eventoRepository.save(evento);
    this.logger.log(`Evento ${id} atualizado`);
    return this.format(saved);
  }

  async remove(id: number) {
    const result = await this.eventoRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Evento ${id} não encontrado`);
    }
    this.logger.log(`Evento ${id} removido`);
    return { deleted: true, id };
  }

  /** Migração dos dados mock que antes viviam em memória em AppService */
  async seedIfEmpty(): Promise<boolean> {
    const count = await this.eventoRepository.count();
    if (count > 0) return false;

    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    const teamMeeting = new EventoPontualEntity();
    Object.assign(teamMeeting, {
      titulo: 'Team Meeting',
      descricao: 'Reunião de sincronização da equipe',
      dataInicio: today.toISOString(),
      dataFim: new Date(today.getTime() + 60 * 60000).toISOString(),
      diaInteiro: false,
    });

    const lunch = new EventoPontualEntity();
    Object.assign(lunch, {
      titulo: 'Lunch with Client',
      descricao: 'Almoço com cliente',
      dataInicio: tomorrow.toISOString(),
      dataFim: new Date(tomorrow.getTime() + 90 * 60000).toISOString(),
      diaInteiro: false,
    });

    await this.eventoRepository.save([teamMeeting, lunch]);
    this.logger.log('Seed: 2 eventos mock migrados para o PostgreSQL');
    return true;
  }
}
