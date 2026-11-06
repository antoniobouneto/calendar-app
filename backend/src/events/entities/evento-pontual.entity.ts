import { ChildEntity } from 'typeorm';
import { EventoEntity } from './evento.entity';

@ChildEntity('PONTUAL')
export class EventoPontualEntity extends EventoEntity {}
