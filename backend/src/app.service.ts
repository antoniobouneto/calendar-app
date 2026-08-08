import { Injectable } from '@nestjs/common';

export interface CalendarEvent {
  id: number;
  title: string;
  date: string;
}

@Injectable()
export class AppService {
  private events: CalendarEvent[] = [
    { id: 1, title: 'Team Meeting', date: new Date().toISOString() },
    { id: 2, title: 'Lunch with Client', date: new Date(Date.now() + 86400000).toISOString() },
  ];

  getHealth() {
    return { status: 'ok', message: 'Calendar backend is running smoothly.' };
  }

  getEvents() {
    return this.events;
  }

  createEvent(title: string, date?: string) {
    const newEvent: CalendarEvent = {
      id: this.events.length + 1,
      title: title || 'Novo Evento',
      date: date || new Date().toISOString(),
    };
    this.events.push(newEvent);
    return newEvent;
  }
}


