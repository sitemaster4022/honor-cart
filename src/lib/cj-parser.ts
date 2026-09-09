import type { CjLinkRecord } from './offers';

export function parseCjXml(xml: string): { records: CjLinkRecord[]; totalMatched: number; recordsReturned: number } {
  const linksTag = xml.match(/<links\b([^>]*)>/i)?.[1] || '';
  const totalMatched = attributeNumber(linksTag, 'total-matched');
  const recordsReturned = attributeNumber(linksTag, 'records-returned');
  const records: CjLinkRecord[] = [];
  const recordPattern = /<link>\s*(?=<advertiser-id>)([\s\S]*?)<\/link>/gi;
  for (const match of xml.matchAll(recordPattern)) {
    const block = match[1];
    records.push({
      advertiserId: tag(block, 'advertiser-id'), advertiserName: tag(block, 'advertiser-name'),
      linkId: tag(block, 'link-id'), linkName: tag(block, 'link-name'), description: tag(block, 'description'),
      promotionType: tag(block, 'promotion-type'), promotionStartDate: tag(block, 'promotion-start-date'),
      promotionEndDate: tag(block, 'promotion-end-date'), couponCode: tag(block, 'coupon-code'),
      destination: tag(block, 'destination'), clickUrl: tag(block, 'clickUrl'), category: tag(block, 'category'),
      lastUpdated: tag(block, 'last-updated')
    });
  }
  return { records, totalMatched, recordsReturned };
}

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return decodeXml((match?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').trim());
}

function decodeXml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    const point = lower.startsWith('&#x') ? Number.parseInt(lower.slice(3, -1), 16) : Number.parseInt(lower.slice(2, -1), 10);
    return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  });
}

function attributeNumber(attributes: string, name: string): number {
  const value = attributes.match(new RegExp(`${name}=["'](\\d+)["']`, 'i'))?.[1];
  return value ? Number(value) : 0;
}

