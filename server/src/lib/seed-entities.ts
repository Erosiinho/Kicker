import { OrganizationType } from '@prisma/client';

export interface SeedEntity {
    qid: string;
    name: string;
    type: OrganizationType;
    group: string;
}

/**
 * Wikidata QIDs resolved via wbsearchentities and spot-checked against their
 * descriptions (a couple of raw top-hits resolved to women's clubs instead of
 * the men's club, e.g. AS Roma / Sevilla FC — corrected here). Empirically
 * confirmed live (see PLAN.md §3): 6036 unique players at
 * NOTABILITY_SITELINKS_THRESHOLD=25 across this exact 63-entity list, 1480 of
 * them with distinctOrgCount >= 3.
 *
 * Add a club/national team by appending a row here, then re-run
 * `npm run seed:wikidata -- --force`.
 */
export const SEED_ENTITIES: SeedEntity[] = [
    // Premier League
    { qid: 'Q18656', name: 'Manchester United F.C.', type: 'CLUB', group: 'Premier League' },
    { qid: 'Q50602', name: 'Manchester City F.C.', type: 'CLUB', group: 'Premier League' },
    { qid: 'Q1130849', name: 'Liverpool F.C.', type: 'CLUB', group: 'Premier League' },
    { qid: 'Q9617', name: 'Arsenal F.C.', type: 'CLUB', group: 'Premier League' },
    { qid: 'Q9616', name: 'Chelsea F.C.', type: 'CLUB', group: 'Premier League' },

    // Ligue 1
    { qid: 'Q483020', name: 'Paris Saint-Germain F.C.', type: 'CLUB', group: 'Ligue 1' },
    { qid: 'Q132885', name: 'Olympique de Marseille', type: 'CLUB', group: 'Ligue 1' },
    { qid: 'Q704', name: 'Olympique Lyonnais', type: 'CLUB', group: 'Ligue 1' },
    { qid: 'Q180305', name: 'AS Monaco FC', type: 'CLUB', group: 'Ligue 1' },
    { qid: 'Q19521', name: 'AS Saint-Étienne', type: 'CLUB', group: 'Ligue 1' },

    // Serie A
    { qid: 'Q1422', name: 'Juventus FC', type: 'CLUB', group: 'Serie A' },
    { qid: 'Q1543', name: 'AC Milan', type: 'CLUB', group: 'Serie A' },
    { qid: 'Q631', name: 'FC Internazionale Milano', type: 'CLUB', group: 'Serie A' },
    { qid: 'Q2739', name: 'AS Roma', type: 'CLUB', group: 'Serie A' },
    { qid: 'Q2641', name: 'SSC Napoli', type: 'CLUB', group: 'Serie A' },

    // La Liga
    { qid: 'Q8682', name: 'Real Madrid CF', type: 'CLUB', group: 'La Liga' },
    { qid: 'Q7156', name: 'FC Barcelona', type: 'CLUB', group: 'La Liga' },
    { qid: 'Q8701', name: 'Atlético Madrid', type: 'CLUB', group: 'La Liga' },
    { qid: 'Q10329', name: 'Sevilla FC', type: 'CLUB', group: 'La Liga' },
    { qid: 'Q10333', name: 'Valencia CF', type: 'CLUB', group: 'La Liga' },

    // Bundesliga
    { qid: 'Q15789', name: 'FC Bayern Munich', type: 'CLUB', group: 'Bundesliga' },
    { qid: 'Q41420', name: 'Borussia Dortmund', type: 'CLUB', group: 'Bundesliga' },
    { qid: 'Q32494', name: 'FC Schalke 04', type: 'CLUB', group: 'Bundesliga' },
    { qid: 'Q104761', name: 'Bayer 04 Leverkusen', type: 'CLUB', group: 'Bundesliga' },

    // Other major clubs
    { qid: 'Q128446', name: 'FC Porto', type: 'CLUB', group: 'Other' },
    { qid: 'Q131499', name: 'SL Benfica', type: 'CLUB', group: 'Other' },
    { qid: 'Q81888', name: 'AFC Ajax', type: 'CLUB', group: 'Other' },
    { qid: 'Q11938', name: 'PSV Eindhoven', type: 'CLUB', group: 'Other' },
    { qid: 'Q19593', name: 'Celtic F.C.', type: 'CLUB', group: 'Other' },
    { qid: 'Q170703', name: 'Boca Juniors', type: 'CLUB', group: 'Other' },
    { qid: 'Q15799', name: 'River Plate', type: 'CLUB', group: 'Other' },
    { qid: 'Q17479', name: 'CR Flamengo', type: 'CLUB', group: 'Other' },
    { qid: 'Q38568', name: 'São Paulo FC', type: 'CLUB', group: 'Other' },
    { qid: 'Q495299', name: 'Galatasaray S.K.', type: 'CLUB', group: 'Other' },

    // National teams
    { qid: 'Q83459', name: 'Brazil', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q79800', name: 'Argentina', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q47774', name: 'France', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q43310', name: 'Germany', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q676899', name: 'Italy', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q42267', name: 'Spain', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q47762', name: 'England', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q267245', name: 'Portugal', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q47050', name: 'Netherlands', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q166776', name: 'Belgium', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q134916', name: 'Uruguay', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q134479', name: 'Croatia', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q212564', name: 'Colombia', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q164089', name: 'Mexico', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q164134', name: 'United States', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q170566', name: 'Japan', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q207441', name: 'Senegal', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q207337', name: 'Morocco', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q181930', name: 'Nigeria', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q172014', name: 'Ghana', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q166196', name: 'Poland', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q131785', name: 'Denmark', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q160826', name: 'Sweden', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q165141', name: 'Switzerland', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q182740', name: 'Serbia', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q180857', name: 'Wales', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q483856', name: 'Turkey', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q543842', name: 'South Korea', type: 'NATIONAL_TEAM', group: 'National team' },
    { qid: 'Q172025', name: 'Chile', type: 'NATIONAL_TEAM', group: 'National team' },
];
