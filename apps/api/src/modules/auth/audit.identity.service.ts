import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

export interface IdentityAuditInput {
  action: string;
  outcome: 'success' | 'failure';
  userId?: string | null;
  organizationId?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_METADATA_KEYS = [
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'hash',
];

function sanitizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase();
    const sensitive = SENSITIVE_METADATA_KEYS.some((k) => lower.includes(k));
    if (sensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

@Injectable()
export class AuditIdentityService {
  private readonly logger = new Logger(AuditIdentityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: IdentityAuditInput): Promise<void> {
    try {
      await this.prisma.audit.create({
        data: {
          module: 'identity',
          action: `${input.action}.${input.outcome}`,
          userId: input.userId ?? null,
          organizationId: input.organizationId ?? null,
          description: input.description,
          metadata: sanitizeMetadata(input.metadata) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // Audit failures must never break authentication flows.
      this.logger.error('audit record failed', error as Error);
    }
  }
}
