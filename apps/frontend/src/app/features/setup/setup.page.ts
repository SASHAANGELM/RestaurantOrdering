import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-setup-page', imports: [RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="eyebrow">Manage the kitchen</p><h1 tabindex="-1">Setup</h1>
    <p class="muted">Keep your menu ready for service. Changes appear live for everyone.</p>
    <div class="setup-links">
      <a routerLink="/setup/categories"><span class="link-icon" aria-hidden="true">☷</span><h2>Categories</h2><p>Organize your menu and choose the category order.</p><span>Manage categories →</span></a>
      <a routerLink="/setup/items"><span class="link-icon" aria-hidden="true">≡</span><h2>Items</h2><p>Edit dishes, photos, prices and availability.</p><span>Manage items →</span></a>
    </div>
  `,
  styles: [`
    .setup-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; max-width: 54rem; margin-top: 2rem; }
    .setup-links a { display: block; padding: 2rem; background: white; border: 1px solid #d7e2e9; border-radius: 1rem; text-decoration: none; }
    .setup-links a:hover { border-color: #2c6c93; background: #f0f6fa; } h2 { margin-top: 1rem; } p { color: #526775; }
    .link-icon { font-size: 2rem; } @media (max-width: 600px) { .setup-links { grid-template-columns: 1fr; } }
  `]
})
export class SetupPage {}
