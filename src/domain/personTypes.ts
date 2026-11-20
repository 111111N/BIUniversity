export interface PersonExternalReference { source: string; value: string }
export interface Person {
  id: string; name: string; revision: number;
  externalReference?: PersonExternalReference;
  createdAt?: string; updatedAt?: string;
  legacyAccountId?: string;
}
export interface PersonDraft { name: string; externalReference?: PersonExternalReference }
export interface PersonChange {
  id: string; personId: string; actorId: string; occurredAt: string;
  action: "created" | "updated"; snapshot: Person;
}
