import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponse } from './dto/health.response';

@ApiTags('health')
@Controller({ path: 'health', version: undefined })
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check (unauthenticated, no version prefix)' })
  @ApiOkResponse({ type: HealthResponse })
  check() {
    return { status: 'ok' };
  }
}
