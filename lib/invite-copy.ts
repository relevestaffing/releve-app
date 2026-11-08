/* One wording for the refusal, shared by the sign-in screen, the sign-in
   callback and the screen an uninvited account lands on. Safe to import from
   client code: nothing here touches the server. */
export const INVITE_ONLY =
  'Relève is by invitation only, and we have no invitation for that email address. If you were expecting one, sign in with the address it was sent to.';

export const DISCOVERY_URL = 'https://relevestaffing.com/discovery';
export const CONTACT = 'hello@relevestaffing.com';

/* The query value the callback sends back to the sign-in page. */
export const NOT_INVITED_CODE = 'not_invited';
