import type {
  CredentialIssuedEvent,
  CredentialRevokedEvent,
  CredentialVerifiedEvent,
  CredentialExpiredEvent,
  CredentialSuspendedEvent,
} from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type CredentialEvent =
  | CredentialIssuedEvent
  | CredentialRevokedEvent
  | CredentialVerifiedEvent
  | CredentialExpiredEvent
  | CredentialSuspendedEvent;

const credentialHandlers: Record<string, EventHandler<CredentialEvent>> = {
  'credential:issued': async (event: CredentialIssuedEvent) => {
    const { credentialId, holderDid, credentialType } = event.payload;
    console.log(`[CredentialHandler] Issued credential ${credentialId} to ${holderDid}: ${credentialType.join(', ')}`);
  },
  'credential:revoked': async (event: CredentialRevokedEvent) => {
    const { credentialId, revokedBy, reason } = event.payload;
    console.log(`[CredentialHandler] Revoked credential ${credentialId} by ${revokedBy}: ${reason}`);
  },
  'credential:verified': async (event: CredentialVerifiedEvent) => {
    const { credentialId, verifierDid, verified, duration } = event.payload;
    console.log(`[CredentialHandler] Verified credential ${credentialId} by ${verifierDid}: ${verified} (${duration}ms)`);
  },
  'credential:expired': async (event: CredentialExpiredEvent) => {
    const { credentialId, holderDid, autoNotify } = event.payload;
    console.log(`[CredentialHandler] Credential ${credentialId} expired for ${holderDid} (notify: ${autoNotify})`);
  },
  'credential:suspended': async (event: CredentialSuspendedEvent) => {
    const { credentialId, suspendedBy, reason, suspendedUntil } = event.payload;
    console.log(`[CredentialHandler] Suspended credential ${credentialId} by ${suspendedBy}: ${reason} until ${suspendedUntil ?? 'indefinite'}`);
  },
};

export function getCredentialHandler(type: string): EventHandler<CredentialEvent> | undefined {
  return credentialHandlers[type];
}

export function getCredentialHandlerTypes(): string[] {
  return Object.keys(credentialHandlers);
}

export const handleCredentialEvent: EventHandler<CredentialEvent> = async (event) => {
  const handler = credentialHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
