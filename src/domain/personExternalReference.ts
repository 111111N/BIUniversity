import type { Person } from "./personTypes";

export const getPersonExternalReferenceKey = (reference: Person["externalReference"]) => reference ? JSON.stringify([reference.source.normalize("NFKC").toLowerCase(), reference.value]) : "";
