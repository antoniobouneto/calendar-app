# Especificação Técnica: Sistema Web de Calendário e Agendamentos

**Projeto:** Sistema Web de Calendário Interativo

**Foco:** Programação Orientada a Objetos (POO), Mapeamento Objeto-Relacional (ORM) e Arquitetura Fullstack Moderna.

## 1. Visão Geral da Stack Tecnológica

| Camada | Tecnologia | Descrição / Papel no Projeto | 
 | ----- | ----- | ----- | 
| **Frontend** | **Next.js (App Router)** | Framework React para renderização híbrida, gerenciamento de rotas e Server Components. | 
| **UI Library** | **Ant Design (`antd`)** | Componentes de interface, utilizando `Calendar`, `Modal`, `Form` e `Badge`. | 
| **Backend** | **NestJS** | Framework Node.js TypeScript orientado a objetos (Dependency Injection, Controllers, Services). | 
| **ORM** | **TypeORM** | Mapeador Objeto-Relacional para traduzir a hierarquia de classes POO em tabelas SQL. | 
| **Banco de Dados** | **PostgreSQL** | Banco relacional robusto com suporte a tipos nativos de data/hora e índices B-Tree. | 

## 2. Modelagem Orientada a Objetos (POO) com Herança

Em vez de criar uma tabela por mês no banco de dados (o que violaria a escalabilidade e a POO), modelamos o conceito abstrato de **`Evento`** com subclasses para diferenciar compromissos únicos e recorrentes.

```
       +------------------------------------+
       |         <>         |
       |               Evento               |
       +------------------------------------+
       | - id: Long                         |
       | - titulo: String                   |
       | - descricao: String                |
       | - dataInicio: Date                 |
       | - dataFim: Date                    |
       | - diaInteiro: Boolean              |
       +------------------------------------+
       | + pertencerAoMes(mes, ano): bool   |
       | + calcularDuracao(): number        |
       +------------------------------------+
                         ^
                         |
      +------------------+------------------+
      |                                     |
+-----------------------+     +-------------------------------+
|     EventoPontual     |     |       EventoRecorrente        |
+-----------------------+     +-------------------------------+
| (Usa atributos base)  |     | - frequencia: EnumFrequencia  |
+-----------------------+     | - dataFimRecorrencia: Date    |
                              +-------------------------------+
                              | + gerarProximasOcorrencias()  |
                              +-------------------------------+

```

### Implementação das Classes em TypeScript (NestJS)

```
// enum-frequencia.ts
export enum EnumFrequencia {
  DIARIA = 'DIARIA',
  SEMANAL = 'SEMANAL',
  MENSAL = 'MENSAL',
  ANUAL = 'ANUAL',
}

// evento.entity.ts (Classe Abstrata Base)
export abstract class Evento {
  id: number;
  titulo: string;
  descricao: string;
  dataInicio: Date;
  dataFim: Date;
  diaInteiro: boolean;
  usuarioId: number;

  constructor(partial: Partial) {
    Object.assign(this, partial);
  }

  // Método de POO para verificar se o evento pertence a um mês/ano
  pertenceAoMes(mes: number, ano: number): boolean {
    const inicio = new Date(this.dataInicio);
    return inicio.getMonth() + 1 === mes && inicio.getFullYear() === ano;
  }
}

// evento-pontual.entity.ts
export class EventoPontual extends Evento {
  // Atributos específicos para eventos únicos
}

// evento-recorrente.entity.ts
export class EventoRecorrente extends Evento {
  frequencia: EnumFrequencia;
  dataFimRecorrencia: Date;

  gerarOcorrenciasParaMes(mes: number, ano: number): Date[] {
    // Lógica polimórfica para calcular datas de repetição no mês solicitado
    return [];
  }
}

```

## 3. Mapeamento Objeto-Relacional (TypeORM & PostgreSQL)

Para persistir a herança de POO no banco de dados, utiliza-se a estratégia **Single Table Inheritance** (Tabela Única). Todas as subclasses compartilham uma tabela chamada `eventos`, com uma coluna discriminadora (`tipo`).

### Mapeamento com Decoradores TypeORM

```
import { Entity, PrimaryGeneratedColumn, Column, TableInheritance, ChildEntity, Index } from 'typeorm';

@Entity('eventos')
@TableInheritance({ column: { type: 'varchar', name: 'tipo' } })
export abstract class EventoEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 150 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Index() // Índice para busca ultra-rápida por data
  @Column({ type: 'timestamp' })
  dataInicio: Date;

  @Column({ type: 'timestamp' })
  dataFim: Date;

  @Column({ default: false })
  diaInteiro: boolean;

  @Column()
  usuarioId: number;
}

@ChildEntity('PONTUAL')
export class EventoPontualEntity extends EventoEntity {}

@ChildEntity('RECORRENTE')
export class EventoRecorrenteEntity extends EventoEntity {
  @Column({ type: 'enum', enum: EnumFrequencia, nullable: true })
  frequencia: EnumFrequencia;

  @Column({ type: 'timestamp', nullable: true })
  dataFimRecorrencia: Date;
}

```

### Script SQL Gerado para o PostgreSQL (DDL)

```
-- Criando o ENUM de frequência
CREATE TYPE frequencia_enum AS ENUM ('DIARIA', 'SEMANAL', 'MENSAL', 'ANUAL');

-- Tabela Única para Eventos (Herança POO)
CREATE TABLE eventos (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL, -- Coluna discriminadora ('PONTUAL' ou 'RECORRENTE')
    titulo VARCHAR(150) NOT NULL,
    descricao TEXT,
    data_inicio TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    data_fim TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    dia_inteiro BOOLEAN DEFAULT FALSE,
    usuario_id INT NOT NULL,
    frequencia frequencia_enum NULL,
    data_fim_recorrencia TIMESTAMP WITHOUT TIME ZONE NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices B-Tree para buscas eficientes por intervalo de mês/ano
CREATE INDEX idx_eventos_data_inicio ON eventos(data_inicio);
CREATE INDEX idx_eventos_usuario_mes ON eventos(usuario_id, data_inicio);

```

## 4. Backend: NestJS (Controller & Service)

O NestJS organiza a lógica em camadas (`Controller` -> `Service` -> `Repository`). O serviço calcula o primeiro e o último dia do mês para consultar o PostgreSQL de forma otimizada.

### `eventos.service.ts`

```
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { EventoEntity } from './entities/evento.entity';

@Injectable()
export class EventosService {
  constructor(
    @InjectRepository(EventoEntity)
    private readonly eventoRepository: Repository,
  ) {}

  async buscarPorMes(usuarioId: number, mes: number, ano: number): Promise {
    // Primeiro dia do mês às 00:00:00
    const inicioMes = new Date(ano, mes - 1, 1, 0, 0, 0);
    // Último dia do mês às 23:59:59
    const fimMes = new Date(ano, mes, 0, 23, 59, 59, 999);

    return this.eventoRepository.find({
      where: {
        usuarioId,
        dataInicio: Between(inicioMes, fimMes),
      },
      order: { dataInicio: 'ASC' },
    });
  }
}

```

### `eventos.controller.ts`

```
import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { EventosService } from './eventos.service';

@Controller('eventos')
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

  @Get()
  async getEventosDoMes(
    @Query('usuarioId', ParseIntPipe) usuarioId: number,
    @Query('mes', ParseIntPipe) mes: number,
    @Query('ano', ParseIntPipe) ano: number,
  ) {
    return this.eventosService.buscarPorMes(usuarioId, mes, ano);
  }
}

```

## 5. Frontend: Next.js (App Router) & Ant Design (`antd`)

No Next.js, utiliza-se o componente `Calendar` do Ant Design. Através da propriedade `cellRender`, os eventos buscados do backend são renderizados como badges interativos nas células do calendário.

### `app/calendario/page.tsx`

```
'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Badge, Modal, Form, Input, Button, message } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

interface EventoDTO {
  id: number;
  titulo: string;
  descricao: string;
  dataInicio: string;
  tipo: 'PONTUAL' | 'RECORRENTE';
}

export default function CalendarioPage() {
  const [eventos, setEventos] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState(null);

  // Busca eventos do backend quando o mês/ano muda
  const carregarEventos = async (mes: number, ano: number) => {
    try {
      const res = await fetch(`http://localhost:3000/eventos?usuarioId=1&mes=\({mes}&ano=\){ano}`);
      const data = await res.json();
      setEventos(data);
    } catch (err) {
      message.error('Erro ao carregar eventos');
    }
  };

  useEffect(() => {
    const hoje = dayjs();
    carregarEventos(hoje.month() + 1, hoje.year());
  }, []);

  // Renderiza badges de eventos dentro de cada célula do dia
  const dateCellRender = (value: Dayjs) => {
    const eventosDoDia = eventos.filter((e) =>
      dayjs(e.dataInicio).isSame(value, 'day')
    );

    return (

```

* <Badge status={item.tipo === 'RECORRENTE' ? 'warning' : 'success'}