import { OrderLifecycleStatus } from '@prisma/client';
import { z } from 'zod';
import { orderTransitionReasonSchema } from './order-lifecycle.service';

export const transitionOrderLifecycleSchema = z.object({
  toStatus: z.nativeEnum(OrderLifecycleStatus),
  expectedFromStatus: z.nativeEnum(OrderLifecycleStatus).optional(),
  reason: orderTransitionReasonSchema,
}).strict();

export type TransitionOrderLifecycleBody = z.infer<typeof transitionOrderLifecycleSchema>;
