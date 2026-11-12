import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedRequestUser { userId: string }

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedRequestUser =>
    context.switchToHttp().getRequest<{ user: AuthenticatedRequestUser }>().user,
);
