import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateFollowUpSequenceStageDto,
  UpdateFollowUpSequenceStageDto,
} from './follow-up-sequence-stage.dto';

function baseStage() {
  return {
    name: 'D0',
    anchor: 'WARRANTY_EXPIRY',
    offsetDays: 0,
    template: 'Hola {customerName}',
  };
}

describe('FollowUpSequenceStageDto', () => {
  describe('CreateFollowUpSequenceStageDto', () => {
    it('accepts the WARRANTY_EXPIRY boundary values -365 and 730', async () => {
      for (const offsetDays of [-365, 730]) {
        const dto = plainToInstance(CreateFollowUpSequenceStageDto, {
          ...baseStage(),
          offsetDays,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects offsetDays above 730', async () => {
      const dto = plainToInstance(CreateFollowUpSequenceStageDto, {
        ...baseStage(),
        offsetDays: 731,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('offsetDays');
    });

    it('rejects offsetDays below -365', async () => {
      const dto = plainToInstance(CreateFollowUpSequenceStageDto, {
        ...baseStage(),
        offsetDays: -366,
      });
      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).toContain('offsetDays');
    });

    it('accepts the PURCHASE_DATE anchors and valid offsets', async () => {
      const dto = plainToInstance(CreateFollowUpSequenceStageDto, {
        ...baseStage(),
        anchor: 'PURCHASE_DATE',
        offsetDays: 0,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects an unknown anchor enum value', async () => {
      const dto = plainToInstance(CreateFollowUpSequenceStageDto, {
        ...baseStage(),
        anchor: 'UNKNOWN',
      });
      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).toContain('anchor');
    });

    it('accepts an optional templateOnPast within the length limit', async () => {
      const dto = plainToInstance(CreateFollowUpSequenceStageDto, {
        ...baseStage(),
        templateOnPast: 'Tu batería está fuera de ciclo. Te esperamos.',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('UpdateFollowUpSequenceStageDto', () => {
    it('accepts a valid partial update at the boundary', async () => {
      const dto = plainToInstance(UpdateFollowUpSequenceStageDto, {
        offsetDays: 730,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects offsetDays above 730', async () => {
      const dto = plainToInstance(UpdateFollowUpSequenceStageDto, {
        offsetDays: 9999,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('offsetDays');
    });

    it('accepts anchor and templateOnPast updates', async () => {
      const dto = plainToInstance(UpdateFollowUpSequenceStageDto, {
        anchor: 'PURCHASE_DATE',
        templateOnPast: 'recompra',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
