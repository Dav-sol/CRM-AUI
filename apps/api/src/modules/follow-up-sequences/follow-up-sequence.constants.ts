import { FollowUpStageAnchor } from '@prisma/client';

export const STAGE_OFFSET_LIMITS: Record<
  FollowUpStageAnchor,
  { min: number; max: number }
> = {
  [FollowUpStageAnchor.PURCHASE_DATE]: { min: 0, max: 365 },
  [FollowUpStageAnchor.WARRANTY_EXPIRY]: { min: -365, max: 730 },
};

export const STAGE_ORDER: Record<FollowUpStageAnchor, number> = {
  [FollowUpStageAnchor.PURCHASE_DATE]: 0,
  [FollowUpStageAnchor.WARRANTY_EXPIRY]: 1,
};
