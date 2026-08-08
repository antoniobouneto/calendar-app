import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { SecurityGuard } from './common/guards/security.guard';
import { Roles } from './common/decorators/roles.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @UseGuards(SecurityGuard)
  @Roles('USER', 'ADMIN')
  @Get('events')
  getEvents() {
    return this.appService.getEvents();
  }

  @UseGuards(SecurityGuard)
  @Roles('ADMIN')
  @Post('events')
  createEvent(@Body() body: { title: string; date?: string }) {
    return this.appService.createEvent(body.title, body.date);
  }
}


