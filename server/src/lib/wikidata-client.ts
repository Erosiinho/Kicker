const SPARQL_URL = process.env.WIKIDATA_SPARQL_URL || 'https://query.wikidata.org/sparql';
const USER_AGENT =
    process.env.WIKIDATA_USER_AGENT ||
    'kicker/1.0 (data ingestion script; https://github.com/kicker/kicker)';
const RETRY_ATTEMPTS = Number(process.env.WIKIDATA_RETRY_ATTEMPTS) || 3;
const RETRY_BASE_DELAY_MS = Number(process.env.WIKIDATA_RETRY_BASE_DELAY_MS) || 1000;
// Confirmed live during this project's own testing: Wikidata's query service
// can enter an aggressive "1 req/min" 429 mode during WDQS incidents. That's
// not a normal transient failure, so it gets its own retry budget/delay
// instead of burning through RETRY_ATTEMPTS' short exponential backoff.
const RATE_LIMIT_MAX_RETRIES = Number(process.env.WIKIDATA_RATE_LIMIT_MAX_RETRIES) || 5;
const RATE_LIMIT_FALLBACK_DELAY_MS =
    Number(process.env.WIKIDATA_RATE_LIMIT_FALLBACK_DELAY_MS) || 60_000;

export interface RawMembership {
    playerQid: string;
    playerName: string;
    teamQid: string;
    startYear: number | null;
    endYear: number | null;
    sitelinks: number;
    imageUrl: string | null;
}

interface SparqlBinding {
    player: { value: string };
    playerLabel: { value: string };
    team: { value: string };
    start?: { value: string };
    end?: { value: string };
    sitelinks: { value: string };
    image?: { value: string };
}

interface SparqlResponse {
    results: { bindings: SparqlBinding[] };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function qidFromUri(uri: string): string {
    return uri.substring(uri.lastIndexOf('/') + 1);
}

function yearFromDateLiteral(value: string | undefined): number | null {
    if (!value) return null;
    const year = Number(value.slice(0, 4));
    return Number.isFinite(year) ? year : null;
}

function buildMembershipQuery(teamQids: string[], sitelinksThreshold: number): string {
    const values = teamQids.map((qid) => `wd:${qid}`).join(' ');
    return `
SELECT ?player ?playerLabel ?team ?start ?end ?sitelinks ?image WHERE {
  VALUES ?team { ${values} }
  ?player p:P54 ?stmt.
  ?stmt ps:P54 ?team.
  OPTIONAL { ?stmt pq:P580 ?start. }
  OPTIONAL { ?stmt pq:P582 ?end. }
  ?player wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks >= ${sitelinksThreshold})
  OPTIONAL { ?player wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

function parseRetryAfterMs(header: string | null): number | null {
    if (!header) return null;
    // Retry-After is either a plain integer number of seconds...
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    // ...or an HTTP-date.
    const dateMs = Date.parse(header);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
    return null;
}

async function runSparqlQuery(query: string): Promise<SparqlBinding[]> {
    const url = `${SPARQL_URL}?${new URLSearchParams({ query, format: 'json' })}`;

    let attempt = 0;
    let rateLimitRetries = 0;
    let lastError: unknown;

    while (attempt < RETRY_ATTEMPTS) {
        try {
            const response = await fetch(url, {
                headers: {
                    Accept: 'application/sparql-results+json',
                    'User-Agent': USER_AGENT,
                },
            });

            if (response.status === 429) {
                if (rateLimitRetries >= RATE_LIMIT_MAX_RETRIES) {
                    throw new Error(
                        `Wikidata SPARQL rate-limited (429) after ${RATE_LIMIT_MAX_RETRIES} rate-limit retries`,
                    );
                }
                rateLimitRetries++;
                const retryAfterHeader = response.headers.get('retry-after');
                const delay = parseRetryAfterMs(retryAfterHeader) ?? RATE_LIMIT_FALLBACK_DELAY_MS;
                console.warn(
                    `[wikidata] rate-limited (429), waiting ${delay}ms (Retry-After: ${retryAfterHeader ?? 'not set'}) [rate-limit retry ${rateLimitRetries}/${RATE_LIMIT_MAX_RETRIES}]`,
                );
                await sleep(delay);
                continue; // doesn't consume a normal retry attempt
            }

            if (!response.ok) {
                throw new Error(
                    `Wikidata SPARQL request failed: ${response.status} ${response.statusText}`,
                );
            }
            const body = (await response.json()) as SparqlResponse;
            return body.results.bindings;
        } catch (err) {
            lastError = err;
            attempt++;
            if (attempt < RETRY_ATTEMPTS) {
                const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
                console.warn(
                    `[wikidata] attempt ${attempt}/${RETRY_ATTEMPTS} failed, retrying in ${delay}ms: ${(err as Error).message}`,
                );
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

/**
 * Fetches every P54 (member of sports team) statement for the given batch of
 * team QIDs, restricted to players clearing `sitelinksThreshold`. Rows with
 * no P580 (start date) are still returned here — the caller drops them (see
 * ingest-wikidata-players.ts step 3), since that's a data-normalization
 * decision, not a fetch concern.
 *
 * Known minor quirk: Wikidata's label service occasionally falls back to
 * returning the bare QID as `playerLabel` under heavy load. Not filtered out
 * here — if it shows up in the DB as a name, it's a cheap manual fix later,
 * not worth complicating this fetch path for.
 */
export async function fetchTeamMemberships(
    teamQids: string[],
    sitelinksThreshold: number,
): Promise<RawMembership[]> {
    const query = buildMembershipQuery(teamQids, sitelinksThreshold);
    const bindings = await runSparqlQuery(query);

    return bindings.map((b) => ({
        playerQid: qidFromUri(b.player.value),
        playerName: b.playerLabel.value,
        teamQid: qidFromUri(b.team.value),
        startYear: yearFromDateLiteral(b.start?.value),
        endYear: yearFromDateLiteral(b.end?.value),
        sitelinks: Number(b.sitelinks.value),
        imageUrl: b.image?.value ?? null,
    }));
}

export function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}
