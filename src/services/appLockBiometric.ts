import { fromBase64Url, toBase64Url } from '@/utils/pinCrypto';

/**
 * Biometric unlock via a WebAuthn platform authenticator.
 *
 * Be clear about what this is. With no server there is no server-generated challenge, no
 * server-side signature verification and no meaningful counter check — our challenge is
 * generated in the page and is therefore replayable by anything running in it. An attacker who
 * can execute JavaScript on this origin skips the whole thing by calling `unlock()` directly.
 *
 * It is nevertheless a real gate for the threat model that actually applies: a person physically
 * holding an unlocked device. For them, `credentials.get()` with `userVerification: 'required'`
 * against a platform authenticator means the *operating system* demands their face, finger or
 * device PIN before the promise resolves. That is the property we want, and the OS enforces it.
 *
 * So: a convenience unlock, never a second factor. The PIN is the root of the gate and is always
 * available on the lock screen — a new device, a new browser profile, a cleared passkey or a
 * domain change all leave the credential dead, and every one of those must land the user on a
 * working PIN pad.
 */

const CHALLENGE_BYTES = 32;
const USER_ID_BYTES = 16;
const TIMEOUT_MS = 60_000;

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof PublicKeyCredential !== 'undefined' &&
    !!navigator.credentials
  );
}

/** Async probe — resolve it into state before rendering the Settings row. */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Returns the base64url rawId to store. Throws on cancellation or failure. */
export async function registerBiometric(userName: string): Promise<string> {
  const label = userName.trim() || 'Finio';

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES)),
      // `rp.id` omitted deliberately: the browser defaults it to the current effective domain.
      // Hard-coding it throws SecurityError and has no single correct value across localhost,
      // a preview deploy and production.
      rp: { name: 'Finio' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(USER_ID_BYTES)),
        name: label,
        displayName: label,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        // The whole point: forces the OS Face ID / Touch ID / Windows Hello prompt.
        userVerification: 'required',
        // We store the rawId ourselves, so a discoverable credential buys nothing — and it
        // would show up in the user's passkey manager and may sync to iCloud or Google, which
        // is confusing UI for what is a local screen-lock toggle.
        residentKey: 'discouraged',
        requireResidentKey: false,
      },
      // We cannot verify attestation and have no use for it; asking for data we will discard
      // is the wrong default.
      attestation: 'none',
      timeout: TIMEOUT_MS,
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('Biometric setup was cancelled');
  return toBase64Url(new Uint8Array(credential.rawId));
}

/** True only when the assertion resolved *and* the authenticator asserted user verification. */
export async function verifyBiometric(credentialIdB64: string): Promise<boolean> {
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES)),
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(credentialIdB64) }],
        userVerification: 'required',
        timeout: TIMEOUT_MS,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return false;

    // Check the UV flag rather than trusting that the browser enforced
    // `userVerification: 'required'` on our behalf — the spec puts that on the relying party,
    // which is us. authenticatorData is a 32-byte rpIdHash followed by a flags byte; bit 2 is UV.
    const response = assertion.response as AuthenticatorAssertionResponse;
    const flags = new Uint8Array(response.authenticatorData)[32];
    return (flags & 0x04) !== 0;
  } catch {
    // NotAllowedError (cancel or timeout) is by far the most common, then a credential deleted
    // from the OS keychain and SecurityError after a domain move. All of them mean "use the PIN".
    return false;
  }
}
