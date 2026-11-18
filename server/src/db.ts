import { PrismaClient } from '@prisma/client';

// Reuse the same pool across dev hot reloads and repeated module initialization.
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ??= (
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
);

export default prisma;
