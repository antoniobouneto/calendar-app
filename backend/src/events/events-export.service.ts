import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EventoEntity } from './entities/evento.entity';
import { EventoRecorrenteEntity } from './entities/evento-recorrente.entity';
import { EnumFrequencia } from './entities/enum-frequencia';

@Injectable()
export class EventsExportService {
  private readonly logger = new Logger(EventsExportService.name);

  constructor(
    @InjectRepository(EventoEntity)
    private readonly eventoRepository: Repository<EventoEntity>,
    private readonly config: ConfigService,
  ) {}

  async findForExport(mes?: number, ano?: number) {
    if (mes && ano) {
      const inicioMes = new Date(ano, mes - 1, 1, 0, 0, 0);
      const fimMes = new Date(ano, mes, 0, 23, 59, 59, 999);
      return this.eventoRepository.find({
        where: { dataInicio: Between(inicioMes, fimMes) },
        order: { dataInicio: 'ASC' },
      });
    }
    return this.eventoRepository.find({ order: { dataInicio: 'ASC' } });
  }

  /** Gera conteúdo iCalendar (RFC 5545) importável no celular. */
  buildICS(eventos: EventoEntity[]): string {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'PRODID:-//Nexus Calendar//PT-BR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Nexus Calendar',
    ];
    const dtstamp = this.toICSDate(new Date());
    for (const ev of eventos) {
      const inicio = new Date(ev.dataInicio);
      const fim = new Date(ev.dataFim);
      if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) continue;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ev.id}-nexus-${ev.titulo?.slice(0, 20).replace(/[^\w\-]/g, '')}@calendar.local`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART:${this.toICSDate(inicio)}`);
      lines.push(`DTEND:${this.toICSDate(fim)}`);
      lines.push(`SUMMARY:${this.escapeICS(ev.titulo || 'Evento')}`);
      if (ev.descricao) {
        lines.push(`DESCRIPTION:${this.escapeICS(ev.descricao)}`);
      }
      // Recorrência simples (RRULE) quando disponível
      const rec = ev as EventoRecorrenteEntity;
      if (rec instanceof EventoRecorrenteEntity && rec.frequencia) {
        const freqMap: Record<string, string> = {
          [EnumFrequencia.DIARIA]: 'FREQ=DAILY',
          [EnumFrequencia.SEMANAL]: 'FREQ=WEEKLY',
          [EnumFrequencia.MENSAL]: 'FREQ=MONTHLY',
          [EnumFrequencia.ANUAL]: 'FREQ=YEARLY',
        };
        const rrule = freqMap[rec.frequencia as string];
        if (rrule) {
          let rule = rrule;
          if (rec.dataFimRecorrencia) {
            rule += `;UNTIL=${this.toICSDate(new Date(rec.dataFimRecorrencia))}`;
          }
          lines.push(`RRULE:${rule}`);
        }
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  async sendExportEmail(destination: string, mes?: number, ano?: number) {
    const email = (destination || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('E-mail destino inválido');
    }

    const eventos = await this.findForExport(mes, ano);
    const ics = this.buildICS(eventos);
    const total = eventos.length;
    const periodo = mes && ano ? `${String(mes).padStart(2, '0')}/${ano}` : 'todos os eventos';

    const subject = `Seu calendário (${periodo}) — ${total} evento(s)`;
    const textBody = [
      `Olá!`,
      ``,
      `Segue em anexo o arquivo eventos.ics com ${total} evento(s) (${periodo}).`,
      `Abra este e-mail no celular e toque no anexo para importar no calendário (iPhone/Android).`,
      ``,
      ...this.buildTextList(eventos),
    ].join('\n');

    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.warn(
        `SMTP não configurado (SMTP_HOST/SMTP_USER/SMTP_PASS). E-mail de exportação SIMULADO para ${email} — ${total} eventos. Configure SMTP para envio real.`,
      );
      return {
        delivered: false,
        simulated: true,
        destination: email,
        total,
        message:
          'SMTP não configurado no servidor (modo simulação). Use "Baixar .ics" para exportar agora ou configure SMTP_HOST/SMTP_USER/SMTP_PASS no backend/.env.',
      };
    }

    const port = Number(this.config.get<string>('SMTP_PORT', '587'));
    const secure = this.config.get<string>('SMTP_SECURE') === 'true' || port === 465;
    const from = this.config.get<string>('MAIL_FROM', smtpUser);

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail({
      from,
      to: email,
      subject,
      text: textBody,
      attachments: [
        {
          filename: 'eventos.ics',
          content: Buffer.from(ics, 'utf-8'),
          contentType: 'text/calendar; charset="UTF-8"',
        },
      ],
    });

    this.logger.log(`E-mail de exportação enviado para ${email} (${total} eventos, id=${info.messageId})`);
    return {
      delivered: true,
      simulated: false,
      destination: email,
      total,
      messageId: info.messageId,
    };
  }

  private buildTextList(eventos: EventoEntity[]): string[] {
    if (eventos.length === 0) return ['(Nenhum evento no período)'];
    return eventos.map((ev) => {
      const d = new Date(ev.dataInicio);
      const label = isNaN(d.getTime())
        ? ''
        : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `- ${label} | ${ev.titulo || 'Evento'}`;
    });
  }

  private escapeICS(text: string): string {
    return (text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n/g, '\\n')
      .replace(/\n/g, '\\n');
  }

  private toICSDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
      `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
    );
  }
}
