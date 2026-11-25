import type { ReactNode } from 'react';

/**
 * The band under a page's title (D-103): board green with a breadboard's holes,
 * and its two rails, red over blue, as the lower edge. `children` sits at the
 * end of the title's line: who is signed in, a way out.
 */
export function PageBand(props: {
  title: string;
  intro?: string;
  /** The width of the page below, so the title lines up with it. */
  width?: string;
  children?: ReactNode;
}) {
  return (
    <div className="band">
      <div className={`mx-auto px-4 pt-8 pb-8 sm:pt-10 ${props.width ?? 'max-w-3xl'}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="min-w-0 flex-[1_1_16rem] text-3xl leading-tight font-extrabold sm:text-[2.5rem]">
            {props.title}
          </h1>
          {props.children}
        </div>
        {props.intro && <p className="mt-2 max-w-2xl text-lg text-chalk/80">{props.intro}</p>}
      </div>
    </div>
  );
}

/** A slim band for pages whose title is inside their card: the bench's edge, and nothing more. */
export function SlimBand() {
  return (
    <div aria-hidden className="band">
      <div className="h-12" />
    </div>
  );
}

/** A button on the band: chalk on green. */
export const bandButton = 'btn min-h-11 border-2 border-chalk/50 px-4 text-chalk hover:bg-chalk/10';
