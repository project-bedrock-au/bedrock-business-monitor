/**
 * Slack delivery — daily digest and on-demand inspection replies
 * Supports both webhook URL and bot token + channel ID methods.
 */

import type { Listing, DigestRunStats } from '../types';

export interface DigestEntry {
  listing: Listing;
  fitReasonsArr: string[];
  missingFacts: string[];
}

const MAX_DIGEST_ENTRIES = 5;

export async function sendDigest(
  entries: DigestEntry[],
  stats: DigestRunStats[],
  backlogCount: number,
  date: string,
  webhookUrl: string,
  botToken?: string,
  channelId?: string,
): Promise<{ ok: boolean; messageRef: string | null }> {
  const text = buildDigestMessage(entries, stats, backlogCount, date);
  return await sendSlackMessage(text, webhookUrl, botToken, channelId);
}

export function buildDigestMessage(
  entries: DigestEntry[],
  stats: DigestRunStats[],
  backlogCount: number,
  date: string,
): string {
  const lines: string[] = [];

  lines.push(`*Bedrock Business Monitor — ${date}*`);

  // Source health line
  const healthLine = buildHealthLine(stats);
  lines.push(healthLine);
  lines.push('');

  const promising = entries.filter(e => e.listing.fit_outcome === 'promising');
  const needsInfo = entries.filter(e => e.listing.fit_outcome === 'needs_information');

  if (entries.length === 0) {
    lines.push('_No new candidates meeting criteria today._');
  } else {
    // Promising
    if (promising.length > 0) {
      lines.push('*🟢 Promising*');
      for (const entry of promising.slice(0, MAX_DIGEST_ENTRIES)) {
        lines.push(formatListingEntry(entry));
      }
    }

    // Needs information
    if (needsInfo.length > 0) {
      lines.push('*🟡 Needs information*');
      for (const entry of needsInfo.slice(0, MAX_DIGEST_ENTRIES - promising.length)) {
        lines.push(formatListingEntry(entry));
      }
    }
  }

  if (backlogCount > 0) {
    lines.push('');
    lines.push(`_${backlogCount} additional listing${backlogCount === 1 ? '' : 's'} pending. Ask Flint to show all._`);
  }

  return lines.join('\n');
}

function formatListingEntry(entry: DigestEntry): string {
  const { listing, fitReasonsArr, missingFacts } = entry;
  const lines: string[] = [''];

  // Header
  const price = listing.asking_price
    ? `Asking $${(listing.asking_price / 1_000_000 >= 1
      ? (listing.asking_price / 1_000_000).toFixed(1) + 'm'
      : (listing.asking_price / 1_000).toFixed(0) + 'k')}`
    : 'Price undisclosed';

  const location = [listing.location_suburb, listing.location_state].filter(Boolean).join(', ') || 'Location unknown';

  lines.push(`*${listing.title ?? 'Untitled listing'} · ${location} · ${price}*`);

  // Financials line
  const revStr = listing.revenue_raw
    ? `Revenue: ${listing.revenue_raw}`
    : `Revenue: not disclosed`;
  const ebitdaStr = listing.ebitda_raw
    ? `EBITDA: ${listing.ebitda_raw}`
    : `EBITDA: not disclosed`;
  const multipleStr = listing.asking_multiple
    ? `Multiple: ${listing.asking_multiple}x (advertised)`
    : 'Multiple: n/a';

  lines.push(`${revStr} | ${ebitdaStr} | ${multipleStr}`);

  // Why look
  if (fitReasonsArr.length > 0) {
    lines.push(`*Why look:* ${fitReasonsArr.slice(0, 3).join('; ')}`);
  }

  // Check / missing facts
  if (missingFacts.length > 0) {
    const topMissing = missingFacts.slice(0, 2).join('; ');
    lines.push(`*Check:* ${topMissing}`);
  }

  // Next action suggestion
  const nextAction = suggestNextAction(listing);
  if (nextAction) {
    lines.push(`*Next:* ${nextAction}`);
  }

  // Link
  lines.push(`<${listing.canonical_url}|View listing>`);

  return lines.join('\n');
}

function suggestNextAction(listing: Listing): string {
  const sector = listing.sector_bedrock ?? listing.sector_raw ?? '';
  const sectorLower = sector.toLowerCase();

  if (sectorLower.includes('fire') || sectorLower.includes('safety')) {
    return 'Request information memorandum; check FPAS accreditation status and contract book';
  }
  if (sectorLower.includes('hvac') || sectorLower.includes('electrical')) {
    return 'Request P&L and maintenance contract schedule; verify ARC/electrical licence';
  }
  if (sectorLower.includes('insurance') || sectorLower.includes('financial_planning')) {
    return 'Request AFSL details, trail book summary, and client retention data';
  }
  if (sectorLower.includes('mortgage')) {
    return 'Request trail book size, aggregator platform, and client loan-in-force data';
  }
  if (sectorLower.includes('allied_health') || sectorLower.includes('physiotherapy')) {
    return 'Request NDIS/Medicare billing breakdown and AHPRA registration details';
  }
  if (sectorLower.includes('building_pest') || sectorLower.includes('pest_control')) {
    return 'Request licence details, client list, and recurring contract schedule';
  }
  if (sectorLower.includes('home_care') || sectorLower.includes('aged_care')) {
    return 'Request HCP/CHSP provider approval status and client caseload breakdown';
  }
  if (sectorLower.includes('bookkeeping') || sectorLower.includes('accounting')) {
    return 'Request client list, average tenure, and recurring engagement schedule';
  }

  return 'Request information memorandum and earnings breakdown from broker';
}

function buildHealthLine(stats: DigestRunStats[]): string {
  const parts = stats.map(s => {
    const icon = s.healthy ? '✓' : '✗';
    const coverage = s.coverageComplete ? '' : ' ⚠️ partial';
    return `${s.sourceName} ${icon} (${s.checked} checked, ${s.newListings} new${coverage})`;
  });
  return `Sources: ${parts.join(' · ')}`;
}

export async function sendInspectionResult(
  listing: Listing,
  webhookUrl: string,
  botToken?: string,
  channelId?: string,
): Promise<{ ok: boolean; messageRef: string | null }> {
  const text = buildInspectionMessage(listing);
  return await sendSlackMessage(text, webhookUrl, botToken, channelId);
}

export function buildInspectionMessage(listing: Listing): string {
  const lines: string[] = [];

  const fitIcon = listing.fit_outcome === 'promising' ? '🟢'
    : listing.fit_outcome === 'needs_information' ? '🟡'
    : listing.fit_outcome === 'excluded' ? '🔴'
    : '⚪';

  lines.push(`*Inspection: ${listing.title ?? 'Unnamed listing'}*`);
  lines.push(`${fitIcon} ${(listing.fit_outcome ?? 'unclassified').replace('_', ' ').toUpperCase()}`);
  lines.push('');
  lines.push(`*Source:* ${listing.source} | *ID:* ${listing.source_listing_id}`);
  lines.push(`*Location:* ${[listing.location_suburb, listing.location_state].filter(Boolean).join(', ') || 'Unknown'}`);
  lines.push(`*Sector:* ${listing.sector_bedrock ?? listing.sector_raw ?? 'Unknown'}`);
  lines.push(`*Broker:* ${listing.broker_name ?? 'Unknown'}`);
  lines.push('');
  lines.push(`*Asking price:* ${listing.asking_price ? `$${listing.asking_price.toLocaleString()}` : 'Not disclosed'}`);
  lines.push(`*Revenue:* ${listing.revenue_raw ?? (listing.revenue ? `$${listing.revenue.toLocaleString()}` : 'Not disclosed')}`);
  lines.push(`*EBITDA:* ${listing.ebitda_raw ?? (listing.ebitda ? `$${listing.ebitda.toLocaleString()}` : 'Not disclosed')}`);

  if (listing.profit_unspecified_raw) {
    lines.push(`*Profit (unspecified type):* ${listing.profit_unspecified_raw}`);
  }

  if (listing.asking_multiple) {
    lines.push(`*Advertised multiple:* ${listing.asking_multiple}x (based on stated EBITDA — not verified)`);
  }

  lines.push('');

  if (listing.description_summary) {
    lines.push(`*Summary:* ${listing.description_summary}`);
  }

  if (listing.fit_reasons) {
    try {
      const reasons = JSON.parse(listing.fit_reasons) as string[];
      if (reasons.length > 0) {
        lines.push('');
        lines.push(`*Rules matched:* ${reasons.slice(0, 4).join('; ')}`);
      }
    } catch { /* ignore */ }
  }

  lines.push('');
  lines.push(`*Review state:* ${listing.review_state}`);
  lines.push(`*First seen:* ${new Date(listing.first_seen).toLocaleDateString('en-AU')}`);

  if (listing.last_fetched) {
    lines.push(`*Last checked:* ${new Date(listing.last_fetched).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}`);
  }

  lines.push(`*Criteria version:* ${listing.criteria_version ?? 'unknown'}`);
  lines.push(`*Extraction model:* ${listing.extraction_version ?? 'unknown'}`);
  lines.push('');
  lines.push(`<${listing.canonical_url}|View original listing>`);

  return lines.join('\n');
}

// ---- Slack delivery ----

export async function sendSlackMessage(
  text: string,
  webhookUrl: string,
  botToken?: string,
  channelId?: string,
): Promise<{ ok: boolean; messageRef: string | null }> {
  if (!webhookUrl && !botToken) {
    console.warn('[slack] No webhook URL or bot token configured');
    return { ok: false, messageRef: null };
  }

  // Prefer webhook (simpler for digest), fall back to bot token + channel
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const ok = resp.ok || resp.status === 200;
      return { ok, messageRef: ok ? 'webhook' : null };
    } catch (err) {
      console.error('[slack] Webhook send failed:', err);
      return { ok: false, messageRef: null };
    }
  }

  // Bot token + channel
  if (botToken && channelId) {
    try {
      const resp = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${botToken}`,
        },
        body: JSON.stringify({ channel: channelId, text, mrkdwn: true }),
      });
      const data = await resp.json() as { ok: boolean; ts?: string; error?: string };
      if (!data.ok) console.error('[slack] Bot API error:', data.error);
      return { ok: data.ok, messageRef: data.ts ?? null };
    } catch (err) {
      console.error('[slack] Bot API send failed:', err);
      return { ok: false, messageRef: null };
    }
  }

  return { ok: false, messageRef: null };
}
