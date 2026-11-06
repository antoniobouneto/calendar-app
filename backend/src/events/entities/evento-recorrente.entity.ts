import { ChildEntity, Column } from 'typeorm';
import { EventoEntity } from './evento.entity';
import { EnumFrequencia } from './enum-frequencia';

@ChildEntity('RECORRENTE')
export class EventoRecorrenteEntity extends EventoEntity {
  @Column({ type: 'enum', enum: EnumFrequencia, nullable: true })
  frequencia?: EnumFrequencia | null;

  @Column({ type: 'timestamp', name: 'data_fim_recorrencia', nullable: true })
  dataFimRecorrencia?: Date | null;

  gerarProximasOcorrencias(limite = 10): Date[] {
    if (!this.dataInicio) return [];
    const out: Date[] = [];
    let d = new Date(this.dataInicio);
    for (let i = 0; i < limite; i++) {
      if (this.dataFimRecorrencia && d > new Date(this.dataFimRecorrencia)) break;
      out.push(new Date(d));
      switch (this.frequencia) {
        case EnumFrequencia.SEMANAL:
          d.setDate(d.getDate() + 7);
          break;
        case EnumFrequencia.MENSAL:
          d.setMonth(d.getMonth() + 1);
          break;
        case EnumFrequencia.ANUAL:
          d.setFullYear(d.getFullYear() + 1);
          break;
        case EnumFrequencia.DIARIA:
        default:
          d.setDate(d.getDate() + 1);
          break;
      }
    }
    return out;
  }
}
