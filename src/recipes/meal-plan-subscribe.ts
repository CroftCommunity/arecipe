// "Add to Google Calendar" affordance for the meal-plan .ics feed. Pure DOM, no
// network, no third-party script — just plain anchors (a top-level navigation to
// Google, not a subresource, so the CSP is untouched).
//
// Gated by the feed allowlist (config/ics-feeds.json, the SAME file the generator
// reads) so the control only appears for an account whose feed is actually
// published — arbitrary any-user subscribe is deliberately out of scope. The feed
// path comes from the shared `feedPath` helper, so the link and the file the
// Action writes are guaranteed to agree.

import feedsConfig from '../../config/ics-feeds.json';
import { feedPath } from './ics-feed-path.js';

const SITE_ORIGIN = 'https://arecipe.app';
const FEED_DIDS: readonly string[] = Array.isArray(feedsConfig.dids)
  ? (feedsConfig.dids as string[])
  : [];

/** Does this DID have a published feed (is it on the allowlist)? */
export const hasFeed = (did: string): boolean => FEED_DIDS.includes(did);

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The absolute, subscribable feed URL for a DID (any calendar app can use it). */
export const feedUrlFor = (did: string): string => `${SITE_ORIGIN}/${feedPath(did)}`;

/** The Google Calendar one-tap "add by URL" deep link (webcal quick-subscribe). */
export const googleSubscribeUrlFor = (did: string): string =>
  `https://www.google.com/calendar/render?cid=webcal://arecipe.app/${feedPath(did)}`;

/** Build the subscribe control for a DID with a published feed, or null if the
 * DID has none. The control offers one-tap Google subscribe plus the raw feed URL
 * (visible + clickable) for any other calendar app. */
export const buildCalendarSubscribe = (did: string): HTMLElement | null => {
  if (!hasFeed(did)) return null;

  const wrap = el('div', 'cal-subscribe');
  wrap.dataset['testid'] = 'calendar-subscribe';

  const google = el('a', 'button button--primary cal-subscribe-google', 'Add to Google Calendar') as HTMLAnchorElement;
  google.href = googleSubscribeUrlFor(did);
  google.target = '_blank';
  google.rel = 'noopener noreferrer';
  google.dataset['testid'] = 'gcal-subscribe';

  const feed = el('a', 'cal-subscribe-url', feedUrlFor(did)) as HTMLAnchorElement;
  feed.href = feedUrlFor(did);
  feed.target = '_blank';
  feed.rel = 'noopener noreferrer';
  feed.dataset['testid'] = 'feed-url';
  feed.title = 'Meal-plan calendar feed — add this URL to any calendar app';

  wrap.append(google, feed);
  return wrap;
};
