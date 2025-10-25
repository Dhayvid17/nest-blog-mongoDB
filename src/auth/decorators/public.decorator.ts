import { SetMetadata } from '@nestjs/common';

// Use Public for routes that don't need authentication, By default, we protect all routes with JWT guard
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
