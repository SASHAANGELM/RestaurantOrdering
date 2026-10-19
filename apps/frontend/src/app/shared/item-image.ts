import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-item-image', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (url() && failed() !== url()) {
    <img [src]="url()" [alt]="name()" width="96" height="80" loading="lazy" decoding="async" (error)="failed.set(url())" />
  } @else {
    <span class="placeholder" role="img" [attr.aria-label]="name() + ' — no image available'"><i class="ti ti-tools-kitchen-2" aria-hidden="true"></i></span>
  }`,
  styles: [`
    :host { display: block; flex-shrink: 0; }
    img, .placeholder { display: block; width: 6rem; height: 5rem; object-fit: cover; border-radius: .5rem; background: #edf3f7; }
    .placeholder { display: grid; place-items: center; background: #2c6c931a; color: #2c6c93; } .placeholder .ti { font-size: 2rem; }
    :host(.circle) img, :host(.circle) .placeholder { width: 2.5rem; height: 2.5rem; border-radius: 50%; } :host(.circle) .ti { font-size: 1.2rem; }
    :host(.hero) img, :host(.hero) .placeholder { width: 100%; height: auto; aspect-ratio: 4 / 3; } :host(.hero) .ti { font-size: 3rem; }
    :host(.preview) img, :host(.preview) .placeholder { width: 100%; height: 10rem; } :host(.preview) .ti { font-size: 3rem; }
    :host(.menu-card) img, :host(.menu-card) .placeholder { width: 100%; height: 10rem; border-radius: 0; } :host(.menu-card) .ti { font-size: 3rem; }
    :host(.gallery) img, :host(.gallery) .placeholder { width: 100%; height: auto; aspect-ratio: 1; border-radius: .35rem; }
  `]
})
export class ItemImage {
  readonly src = input<string | null | undefined>();
  readonly name = input.required<string>();
  readonly failed = signal<string | null>(null);
  readonly url = computed(() => (this.src() ?? '').trim().replace(/^\/images\//, '/api/images/'));
}
