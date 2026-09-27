export interface SmsSegmentInfo {
  segments: number;
  encoding: 'GSM_7' | 'UCS_2';
}

const GSM_7_CHARS = new Set<string>(
  '@£$¥èéùìòÇ\nØø\rÅΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZ',
);

const GSM_7_EXTENDED = new Set<string>(['^{}\\[~]|€']);

const GSM_7_SINGLE_LIMIT = 160;
const GSM_7_MULTI_LIMIT = 153;
const UCS2_SINGLE_LIMIT = 70;
const UCS2_MULTI_LIMIT = 67;

function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM_7_CHARS.has(ch) && !GSM_7_EXTENDED.has(ch)) {
      return false;
    }
  }
  return true;
}

export function countSmsSegments(content: string): SmsSegmentInfo {
  if (!content || content.length === 0) {
    return { segments: 0, encoding: 'GSM_7' };
  }

  const encoding = isGsm7(content) ? 'GSM_7' : 'UCS_2';
  const singleLimit =
    encoding === 'GSM_7' ? GSM_7_SINGLE_LIMIT : UCS2_SINGLE_LIMIT;
  const multiLimit =
    encoding === 'GSM_7' ? GSM_7_MULTI_LIMIT : UCS2_MULTI_LIMIT;

  if (content.length <= singleLimit) {
    return { segments: 1, encoding };
  }

  const segments = Math.ceil(content.length / multiLimit);
  return { segments, encoding };
}
