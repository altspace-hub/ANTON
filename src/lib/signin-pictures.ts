/**
 * The pictures of Anton on the sign-in page's left half.
 *
 * Pictures 3 and up of the owner's character set (1 is the icon, 2 the
 * pop-up). One is chosen at random on each visit. Each ships in two widths
 * under public/characters/anton/: 1100w for the desktop half and 640w for
 * narrow screens, served from ANTON's own origin.
 */

export interface SigninPicture {
  /** 1100 px wide, the desktop half. */
  src: string;
  /** 640 px wide, for narrow screens. */
  srcSmall: string;
}

const NUMBERS = [3, 4, 5, 6, 7, 8] as const;

export const SIGNIN_PICTURES: readonly SigninPicture[] = NUMBERS.map((n) => ({
  src: `/characters/anton/anton_${n}-1100w.webp`,
  srcSmall: `/characters/anton/anton_${n}-640w.webp`,
}));

/** "<Name>, the <role>": what a screen reader says for every picture. */
export const SIGNIN_PICTURE_ALT = 'Anton, the AI expert assistant';

/** An index into SIGNIN_PICTURES; `random` returns a number in [0, 1). */
export function pickSigninPicture(random: () => number = Math.random): number {
  const i = Math.floor(random() * SIGNIN_PICTURES.length);
  return Math.min(Math.max(i, 0), SIGNIN_PICTURES.length - 1);
}
