import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: { organization: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      organization: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  it('finds an organization by id', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });

    const result = await service.findById('org-1');

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
    });
    expect(result).toEqual({ id: 'org-1' });
  });

  it('returns null when the organization does not exist', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(service.findById('missing')).resolves.toBeNull();
  });
});
