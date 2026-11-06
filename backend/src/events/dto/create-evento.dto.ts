import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { EnumFrequencia, TipoEvento } from '../entities/enum-frequencia';

/**
 * Aceita tanto o formato legado do frontend { title, date }
 * quanto o formato da especificação { titulo, dataInicio, dataFim }.
 */
export class CreateEventoDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  titulo?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;

  @IsOptional()
  @IsBoolean()
  diaInteiro?: boolean;

  @IsOptional()
  @IsString()
  usuarioId?: string;

  @IsOptional()
  @IsEnum(TipoEvento)
  tipo?: TipoEvento;

  @IsOptional()
  @IsEnum(EnumFrequencia)
  frequencia?: EnumFrequencia;

  @IsOptional()
  @IsDateString()
  dataFimRecorrencia?: string;
}
