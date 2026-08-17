import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditIdentityService } from '../audit/audit-identity.service';
import { PrismaService } from '../../prisma/prisma.service';

export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async create() {
    return { ok: true };
  }

  async list() {
    return { ok: true };
  }

  async detail() {
    return { ok: true };
  }

  async activate() {
    return { ok: true };
  }

  async pause() {
    return { ok: true };
  }

  async resume() {
    return { ok: true };
  }

  async cancel() {
    return { ok: true };
  }

  async previewSegment() {
    return { ok: true };
  }

  @OnEvent('AutomationExecuted')
  async handleAutomationExecuted() {
    return { ok: true };
  }
}