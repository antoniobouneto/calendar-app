import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsDateString, Max, Min } from 'class-validator';

export class ListEventosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  ano?: number;

  @IsOptional()
  @IsString()
  usuarioId?: string;

  /**
   * Filtro por dia (grade horária 00–23h).
   * Formato esperado: 'YYYY-MM-DD' (data local, ex: 2026-11-09).
   * Quando presente, retorna apenas eventos cujo intervalo
   * [dataInicio, dataFim] intersecta o dia informado —
   * ideal para a aba "Eventos do Dia" com todas as horas.
   */
  @IsOptional()
  @IsDateString()
  data?: string;
}
