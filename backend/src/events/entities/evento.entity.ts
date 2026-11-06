import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  TableInheritance,
  CreateDateColumn,
  Index,
  Check,
} from 'typeorm';

/**
 * Remodelação para múltiplos eventos por dia (grade horária 00–23h).
 *
 * Regras:
 * - data_inicio / data_fim são TIMESTAMP completos (data + hora).
 * - Vários eventos no mesmo dia são permitidos — NÃO há UNIQUE em (usuario_id, data_inicio).
 * - data_fim >= data_inicio (CHECK).
 * - Eventos `dia_inteiro = true` são normalizados no service para
 *   00:00:00 do dia até 23:59:59 do dia.
 * - Índices:
 *   idx_eventos_data_inicio      → busca por mês / por dia (range GE/LE em data_inicio)
 *   idx_eventos_data_fim         → varredura de sobreposição / spans
 *   idx_eventos_usuario_mes      → grade do mês por usuário
 *   idx_eventos_usuario_dia      → grade horária do dia por usuário (aba "Eventos do Dia")
 */
@Entity('eventos')
@TableInheritance({ column: { type: 'varchar', name: 'tipo' } })
@Check('chk_eventos_data_fim_maior_que_inicio', '"data_fim" >= "data_inicio"')
@Index('idx_eventos_data_inicio', ['dataInicio'])
@Index('idx_eventos_data_fim', ['dataFim'])
@Index('idx_eventos_usuario_mes', ['usuarioId', 'dataInicio'])
@Index('idx_eventos_usuario_dia', ['usuarioId', 'dataInicio', 'dataFim'])
export abstract class EventoEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 150 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao?: string | null;

  @Column({ type: 'timestamp', name: 'data_inicio' })
  dataInicio: Date;

  @Column({ type: 'timestamp', name: 'data_fim' })
  dataFim: Date;

  @Column({ type: 'boolean', name: 'dia_inteiro', default: false })
  diaInteiro: boolean;

  // A especificação original previa usuario_id INT, mas o auth atual
  // usa ids do tipo string ('usr_admin_001'). Usamos varchar nullable
  // para manter compatibilidade com o JWT/Valkey e não quebrar o seed.
  @Column({ type: 'varchar', length: 255, name: 'usuario_id', nullable: true })
  usuarioId?: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'criado_em' })
  criadoEm: Date;

  constructor(partial?: Partial<EventoEntity>) {
    if (partial) Object.assign(this, partial);
  }

  // POO: verifica se o evento pertence a um mês/ano
  pertenceAoMes(mes: number, ano: number): boolean {
    const inicio = new Date(this.dataInicio);
    return inicio.getMonth() + 1 === mes && inicio.getFullYear() === ano;
  }

  // POO: duração em minutos
  calcularDuracao(): number {
    if (!this.dataInicio || !this.dataFim) return 0;
    return Math.round(
      (new Date(this.dataFim).getTime() - new Date(this.dataInicio).getTime()) /
        60000,
    );
  }
}
