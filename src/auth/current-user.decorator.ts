import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthUser } from './types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
