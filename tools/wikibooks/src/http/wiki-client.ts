// The Action API surface the tool uses, layered on the etiquette transport.
// formatversion=2 shapes throughout. NOTE: there is deliberately no method here
// that touches list=recentchanges — see D3 and the constraint test.
import type { WikiTransport } from './transport.ts';
import type { Config } from '../config.ts';
import type { EnumPage, RevInfo } from '../discover.ts';

const REVISION_BATCH = 50; // multivalue cap for regular clients

export type PageInfo = { pageid: number; title: string; missing: boolean };

export type PageContent = {
  pageid: number;
  title: string;
  revid: number;
  timestamp: string;
  wikitext: string;
  /** The exact Action API request URL this content came from (D4 provenance). */
  requestUrl: string;
};

export class WikiClient {
  private readonly cfg: Config;
  private readonly transport: WikiTransport;

  constructor(cfg: Config, transport: WikiTransport) {
    this.cfg = cfg;
    this.transport = transport;
  }

  get requestCount(): number {
    return this.transport.requestCount;
  }

  /** VERIFY the Cookbook namespace id at runtime; never trust the cached 102. */
  async resolveCookbookNamespaceId(): Promise<number> {
    const res = (await this.transport.get({
      action: 'query',
      meta: 'siteinfo',
      siprop: 'namespaces',
    })) as { query?: { namespaces?: Record<string, { id: number; name?: string; canonical?: string }> } };
    const namespaces = res.query?.namespaces ?? {};
    for (const ns of Object.values(namespaces)) {
      if (ns.name === 'Cookbook' || ns.canonical === 'Cookbook') return ns.id;
    }
    throw new Error('could not resolve the Cookbook namespace from siteinfo');
  }

  /** Enumerate Category:Recipes (pages only), following continuation. */
  async enumerateRecipes(category = 'Category:Recipes'): Promise<EnumPage[]> {
    const out: EnumPage[] = [];
    let cmcontinue: string | undefined;
    do {
      const params: Record<string, string> = {
        action: 'query',
        list: 'categorymembers',
        cmtitle: category,
        cmtype: 'page',
        cmprop: 'ids|title',
        cmlimit: 'max',
      };
      if (cmcontinue !== undefined) params.cmcontinue = cmcontinue;
      const res = (await this.transport.get(params)) as {
        query?: { categorymembers?: { pageid: number; title: string }[] };
        continue?: { cmcontinue?: string };
      };
      for (const m of res.query?.categorymembers ?? []) {
        out.push({ pageid: m.pageid, title: m.title });
      }
      cmcontinue = res.continue?.cmcontinue;
    } while (cmcontinue !== undefined);
    return out;
  }

  /** Enumerate subcategories of a category (for the flatness check / fallback). */
  async enumerateSubcategories(category: string): Promise<string[]> {
    const out: string[] = [];
    let cmcontinue: string | undefined;
    do {
      const params: Record<string, string> = {
        action: 'query',
        list: 'categorymembers',
        cmtitle: category,
        cmtype: 'subcat',
        cmprop: 'title',
        cmlimit: 'max',
      };
      if (cmcontinue !== undefined) params.cmcontinue = cmcontinue;
      const res = (await this.transport.get(params)) as {
        query?: { categorymembers?: { title: string }[] };
        continue?: { cmcontinue?: string };
      };
      for (const m of res.query?.categorymembers ?? []) out.push(m.title);
      cmcontinue = res.continue?.cmcontinue;
    } while (cmcontinue !== undefined);
    return out;
  }

  /** Latest revid + timestamp for each pageid, in batches of 50. */
  async revisionSweep(pageids: number[]): Promise<RevInfo[]> {
    const out: RevInfo[] = [];
    for (let i = 0; i < pageids.length; i += REVISION_BATCH) {
      const batch = pageids.slice(i, i + REVISION_BATCH);
      const res = (await this.transport.get({
        action: 'query',
        pageids: batch.join('|'),
        prop: 'revisions',
        rvprop: 'ids|timestamp',
        rvslots: 'main',
      })) as {
        query?: {
          pages?: { pageid: number; title: string; revisions?: { revid: number; timestamp: string }[] }[];
        };
      };
      for (const pg of res.query?.pages ?? []) {
        const rev = pg.revisions?.[0];
        if (rev !== undefined) out.push({ pageid: pg.pageid, revid: rev.revid, timestamp: rev.timestamp });
      }
    }
    return out;
  }

  /** Fetch wikitext + metadata for new/changed pages, in batches of 50 (D4). */
  async fetchContent(pageids: number[]): Promise<PageContent[]> {
    const out: PageContent[] = [];
    for (let i = 0; i < pageids.length; i += REVISION_BATCH) {
      const batch = pageids.slice(i, i + REVISION_BATCH);
      const params = {
        action: 'query',
        pageids: batch.join('|'),
        prop: 'revisions',
        rvprop: 'ids|timestamp|content',
        rvslots: 'main',
      };
      const requestUrl = this.transport.buildUrl(params);
      const res = (await this.transport.get(params)) as {
        query?: {
          pages?: {
            pageid: number;
            title: string;
            revisions?: {
              revid: number;
              timestamp: string;
              slots?: { main?: { content?: string } };
              content?: string;
            }[];
          }[];
        };
      };
      for (const pg of res.query?.pages ?? []) {
        const rev = pg.revisions?.[0];
        if (rev === undefined) continue;
        const wikitext = rev.slots?.main?.content ?? rev.content ?? '';
        out.push({
          pageid: pg.pageid,
          title: pg.title,
          revid: rev.revid,
          timestamp: rev.timestamp,
          wikitext,
          requestUrl,
        });
      }
    }
    return out;
  }

  /** Fetch content by title (for the live smoke test's named pages, D12). */
  async fetchContentByTitles(titles: string[]): Promise<PageContent[]> {
    const params = {
      action: 'query',
      titles: titles.join('|'),
      prop: 'revisions',
      rvprop: 'ids|timestamp|content',
      rvslots: 'main',
    };
    const requestUrl = this.transport.buildUrl(params);
    const res = (await this.transport.get(params)) as {
      query?: {
        pages?: {
          pageid: number;
          title: string;
          revisions?: { revid: number; timestamp: string; slots?: { main?: { content?: string } } }[];
        }[];
      };
    };
    const out: PageContent[] = [];
    for (const pg of res.query?.pages ?? []) {
      const rev = pg.revisions?.[0];
      if (rev === undefined) continue;
      out.push({
        pageid: pg.pageid,
        title: pg.title,
        revid: rev.revid,
        timestamp: rev.timestamp,
        wikitext: rev.slots?.main?.content ?? '',
        requestUrl,
      });
    }
    return out;
  }

  /** prop=info to resolve a vanished page: still exists → decategorised; missing → deleted. */
  async pageInfo(pageid: number): Promise<PageInfo> {
    const res = (await this.transport.get({
      action: 'query',
      pageids: String(pageid),
      prop: 'info',
    })) as { query?: { pages?: { pageid?: number; title?: string; missing?: boolean }[] } };
    const pg = res.query?.pages?.[0];
    return {
      pageid: pg?.pageid ?? pageid,
      title: pg?.title ?? '',
      missing: pg?.missing === true,
    };
  }

  /** Count of members in a category (categoryinfo) — used by the flatness check. */
  async categoryCount(category: string): Promise<number> {
    const res = (await this.transport.get({
      action: 'query',
      titles: category,
      prop: 'categoryinfo',
    })) as { query?: { pages?: { categoryinfo?: { pages?: number } }[] } };
    return res.query?.pages?.[0]?.categoryinfo?.pages ?? 0;
  }

  expectedNamespaceId(): number {
    return this.cfg.expectedCookbookNamespaceId;
  }
}
