/**
 * On a wide screen the lab's parts list and work panel are rails that open
 * over the board while the pointer is on them (D-106). Tests of what the lab
 * does, not of how its screen is shared out, run with both kept open, as a
 * student may choose: then nothing covers the board, and nothing they look
 * at folds away. `workspace.spec.ts` tests the rails themselves, from a
 * browser that has chosen nothing.
 */
export const panelsKeptOpen = (origin: string) => ({
  cookies: [],
  origins: [
    {
      origin,
      localStorage: [{ name: 'banglalab.panels', value: '{"parts":true,"panel":true}' }],
    },
  ],
});

/** A browser that has chosen nothing: the rails as they first appear. */
export const nothingChosen = { cookies: [], origins: [] };
