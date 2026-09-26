/**
 * sign-in-errors.ts — what the server's ?auth_error= reasons mean to the person
 * signing in. Shared by the main and School login pages.
 *
 * Only these fixed codes are ever shown. The parameter itself never is: a link
 * like /?auth_error=Your_password_expired._Reset_it_at_evil.example would
 * otherwise put an attacker's words in the trusted page's error box.
 */
export const SIGN_IN_ERRORS: Readonly<Record<string, string>> = {
  sso_denied: 'Your organisation did not let this sign-in through. You may not be assigned to ANTON yet — ask IT.',
  tenant_not_allowed: 'This Microsoft account belongs to an organisation that is not allowed to sign in here.',
  no_role: 'Your account has no ANTON role in the directory yet — ask IT to assign you one.',
  groups_overage: 'Your account is in too many groups for ANTON to read its role — ask IT to assign ANTON roles to you directly.',
  account_disabled: 'This account has been switched off. Ask an administrator.',
  ambiguous_email: 'More than one ANTON account uses your email address. Ask an administrator to sort it out.',
  sso_misconfigured: 'Single sign-on is not set up correctly on this server. Ask IT.',
  invalid_state: 'The sign-in took too long or was started in another window. Please try again.',
  oidc_start_failed: 'Could not reach the sign-in service. Please try again, or ask IT.',
  oidc_callback_failed: 'Sign-in could not be completed. Please try again, or ask IT.',
  oauth_failed: 'Sign-in could not be completed. Please try again.',
  not_configured: 'This sign-in method is not set up on this server.',
  no_code: 'Sign-in could not be completed. Please try again.',
  no_email: 'Your account has no email address to sign in with.',
};

const GENERIC = 'Sign-in could not be completed. Please try again.';

/** The message for a reason code; a generic one for anything else. */
export function signInErrorMessage(code: string | null | undefined): string {
  return (code && Object.prototype.hasOwnProperty.call(SIGN_IN_ERRORS, code)) ? SIGN_IN_ERRORS[code] : GENERIC;
}
