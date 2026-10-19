import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-item-image', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<img [src]="displayUrl()" [alt]="name()" width="96" height="80" loading="lazy" decoding="async" (error)="failed.set(url())" />`,
  styles: [`:host { display: block; flex-shrink: 0; } img { display: block; width: 6rem; height: 5rem; object-fit: cover; border-radius: .5rem; background: #edf3f7; } :host(.circle) img { width: 2.5rem; height: 2.5rem; border-radius: 50%; } :host(.hero) img { width: 100%; height: auto; aspect-ratio: 4 / 3; }`]
})
export class ItemImage {
  readonly src = input<string | null | undefined>();
  readonly name = input.required<string>();
  readonly failed = signal<string | null>(null);
  readonly url = computed(() => (this.src() || '/api/images/salad.jpg').replace(/^\/images\//, '/api/images/'));
  readonly displayUrl = computed(() => this.failed() === this.url() ? '/api/images/salad.jpg' : this.url());
}
