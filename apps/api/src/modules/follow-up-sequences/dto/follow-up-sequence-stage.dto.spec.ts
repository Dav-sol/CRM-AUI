import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateFollowUpSequenceStageDto,
  UpdateFollowUpSequenceStageDto,
} from './follow-up-sequence-stage.dto';

function baseStage() {
  return {
    name: 'D0',
    offsetDays: 0,
    template: 'Hola {customerName}',
  };
}

describe('FollowUpSequenceStageDto (F-03: offsetDays ∈ [-365, 365])', () => {
  describe('CreateFollowUpSequenceStageDto', () => {
    it('accepts the boundary values -365 and 365', async () => {
      for (const offsetDays of [-365, 365]) {
        const dto = plainToInstance(CreateFollowUpSequenceStageDto, {
          ...baseStage(),
          offsetDays,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects offsetDays above 365', async () => {
      const dto = plainToInstance(CreateFollowUpSequenceStageDto, {
        ...baseStage(),
        offsetDays: 366,
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
  });

  describe('UpdateFollowUpSequenceStageDto', () => {
    it('accepts a valid partial update at the boundary', async () => {
      const dto = plainToInstance(UpdateFollowUpSequenceStageDto, {
        offsetDays: 365,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects offsetDays above 365', async () => {
      const dto = plainToInstance(UpdateFollowUpSequenceStageDto, {
        offsetDays: 9999,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('offsetDays');
    });
  });
});
