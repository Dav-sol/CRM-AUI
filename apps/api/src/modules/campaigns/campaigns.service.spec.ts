import { Test, inject } from '@angular/core/testing';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignSegmentDto } from './dto/campaign-segment.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { CampaignStatus } from '@prisma/client';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: PrismaService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CampaignsService, PrismaService]
    });
    service = Test.inject(CampaignsService);
    prisma = Test.inject(PrismaService);
  });

  describe('create', () => {
    it('should create a campaign as DRAFT', () => {
      const createDto: CreateCampaignDto = {
        name: 'Test Campaign',
        description: 'A test campaign',
        type: 'AUTOMATIC',
        template: 'Hello {customerName}!',
        segment: {
          city: 'Madrid',
        },
        startAt: new Date().toISOString(),
      };

      // Mock prisma.campaign.create
      const mockCampaign = {
        uuid: 'test-uuid',
        name: 'Test Campaign',
        description: 'A test campaign',
        type: 'AUTOMATIC',
        template: 'Hello {customerName}!',
        segment: { city: 'Madrid' },
        startAt: new Date(),
        status: 'DRAFT' as CampaignStatus,
        _count: { automations: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ;(prisma.campaign.create as any).mockResolvedValue(mockCampaign as any);

      const result = await service.create(createDto, null, 'org-1');

      expect(result.uuid).toBe('test-uuid');
      expect(result.name).toBe('Test Campaign');
      expect(result.status).toBe('DRAFT');
    });
  });

  describe('list', () => {
    it('should list campaigns with filters', () => {
      const queryDto: QueryCampaignsDto = {
        page: 1,
        limit: 20,
        sort: '-createdAt',
      };

      const mockCampaigns = [
        {
          uuid: '1',
          name: 'Campaign 1',
          description: 'Desc 1',
          type: 'AUTOMATIC',
          status: 'DRAFT',
          startAt: null,
          segment: null,
          _count: { automations: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      ;(prisma.campaign.findMany as any).mockResolvedValue(mockCampaigns);
      ;(prisma.campaign.count as any).mockResolvedValue(1);

      const result = await service.list(queryDto, 'org-1');

      expect(result.data.length).toBe(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('detail', () => {
    it('should return campaign detail', () => {
      const mockCampaign = {
        uuid: '1',
        name: 'Campaign 1',
        description: 'Desc 1',
        type: 'AUTOMATIC',
        status: 'DRAFT',
        startAt: null,
        segment: null,
        _count: { automations: { where: { status: 'EXECUTED' } }, automations: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ;(prisma.campaign.findUnique as any).mockResolvedValue(mockCampaign);

      const result = await service.detail('1', 'org-1');

      expect(result.uuid).toBe('1');
      expect(result.name).toBe('Campaign 1');
      expect(result.status).toBe('DRAFT');
    });
  });

  describe('activate', () => {
    it('should activate a DRAFT campaign', () => {
      const mockCampaign = {
        uuid: '1',
        name: 'Campaign 1',
        status: 'DRAFT',
      };

      ;(prisma.campaign.findUnique as any).mockResolvedValue(mockCampaign);

      ;(prisma.campaign.updateMany as any).mockResolvedValue({ count: 1 });

      const result = await service.activate('1', null, 'org-1');

      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('pause', () => {
    it('should pause an ACTIVE campaign', () => {
      const mockCampaign = {
        uuid: '1',
        name: 'Campaign 1',
        status: 'ACTIVE',
      };

      ;(prisma.campaign.findUnique as any).mockResolvedValue(mockCampaign);

      ;(prisma.campaign.update as any).mockResolvedValue({ status: 'PAUSED' });

      const result = await service.pause('1', null, 'org-1');

      expect(result.status).toBe('PAUSED');
    });
  });

  describe('cancel', () => {
    it('should cancel a campaign', () => {
      const mockCampaign = {
        uuid: '1',
        name: 'Campaign 1',
        status: 'ACTIVE',
      };

      ;(prisma.campaign.findUnique as any).mockResolvedValue(mockCampaign);

      ;(prisma.automation.updateMany as any).mockResolvedValue({ count: 0 });

      ;(prisma.campaign.update as any).mockResolvedValue({ status: 'CANCELLED' });

      const result = await service.cancel('1', null, 'org-1');

      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('previewSegment', () => {
    it('should return qualifying customer count', () => {
      const mockPurchases = [
        { customer: { id: '1', name: 'Customer 1' } },
        { customer: { id: '2', name: 'Customer 2' } },
      ];

      ;(prisma.purchase.findMany as any).mockResolvedValue(mockPurchases);

      const result = await service.previewSegment('1');

      expect(result.count).toBe(2);
    });
  });
});