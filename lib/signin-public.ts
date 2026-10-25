/* Shared by the server that records a failed sign-in, the email that reports
   it and the console page that lists them, so the three never drift into
   three different names for the same moment. */

export const SIGNIN_STAGES = {
  exchange:       'the sign-in link could not be exchanged for a session',
  profile_create: 'the account was created but its profile row could not be written',
  role_set:       'the account exists but its side could not be set'
} as const;

export type SigninStage = keyof typeof SIGNIN_STAGES;

export function signinStageLabel(stage: string): string {
  return (SIGNIN_STAGES as Record<string, string>)[stage] ?? stage;
}
