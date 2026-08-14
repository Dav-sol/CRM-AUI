import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let service: { findById: jest.Mock };

  beforeEach(async () => {
    service = { findById: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [{ provide: OrganizationsService, useValue: service }],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it('returns the organization found by id', async () => {
    service.findById.mockResolvedValue({ id: 'org-1' });

    const result = await controller.findOne('org-1');

    expect(service.findById).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ data: { id: 'org-1' } });
  });

  it('throws NOT_FOUND when the organization does not exist', async () => {
    service.findById.mockResolvedValue(null);

    await expect(controller.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
