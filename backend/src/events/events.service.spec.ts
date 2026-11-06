import { EventsService } from './events.service';

describe('EventsService (format)', () => {
  const service = new EventsService({} as any);

  it('retorna formato legado {title,date} + especificação', () => {
    const e: any = {
      id: 1,
      titulo: 'Team Meeting',
      descricao: null,
      dataInicio: new Date('2026-11-06T10:00:00Z'),
      dataFim: new Date('2026-11-06T11:00:00Z'),
      diaInteiro: false,
      usuarioId: 'usr_admin_001',
      criadoEm: new Date('2026-11-06T10:00:00Z'),
    };
    const out = service.format(e);
    expect(out.id).toBe(1);
    expect(out.title).toBe('Team Meeting');
    expect(out.date).toBe(e.dataInicio.toISOString());
    expect(out.titulo).toBe('Team Meeting');
    expect(out.dataInicio).toBe(e.dataInicio.toISOString());
    expect(out.tipo).toBe('PONTUAL');
  });

  it('pertenceAoMes / calcularDuracao helpers da entidade', () => {
    const e: any = {
      dataInicio: new Date(2026, 10, 6, 10),
      dataFim: new Date(2026, 10, 6, 11),
    };
    // helpers estão na entidade abstrata
    const { EventoPontualEntity } = require('./entities/evento-pontual.entity');
    const ev = new EventoPontualEntity();
    Object.assign(ev, e);
    expect(ev.pertenceAoMes(11, 2026)).toBe(true);
    expect(ev.pertenceAoMes(12, 2026)).toBe(false);
    expect(ev.calcularDuracao()).toBe(60);
  });
});
