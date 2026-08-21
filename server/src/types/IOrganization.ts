import { OrganizationType } from '@prisma/client';

export default interface IOrganization {
    id: number;
    wikidataQid: string;
    name: string;
    type: OrganizationType;
}

export { OrganizationType };
