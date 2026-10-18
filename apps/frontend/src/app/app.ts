import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <p class="eyebrow">Restaurant Ordering</p>
      <h1>A place for every order.</h1>
      <p>The workspace is ready. Menu, Setup, and Orders will arrive in the next implementation tasks.</p>
    </main>
  `,
  styles: `
    main { max-width: 48rem; margin: 12vh auto; padding: 2rem; }
    .eyebrow { font-size: 0.875rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { font-size: clamp(2.5rem, 6vw, 4rem); line-height: 1.1; }
    p { max-width: 38rem; line-height: 1.7; }
  `
})
export class App {}
