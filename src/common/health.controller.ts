import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller({ path: 'health', version: undefined })
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
