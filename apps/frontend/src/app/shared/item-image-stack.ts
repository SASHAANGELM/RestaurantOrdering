import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ItemImage } from './item-image';

@Component({
  selector: 'app-item-image-stack', imports: [ItemImage], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="images">@for (item of visible(); track item.id) { <app-item-image class="circle" [src]="item.imageUrl" [name]="item.name" /> }</div>`,
  styles: [`:host { display: inline-flex; flex-shrink: 0; } .images { display: flex; padding-right: .5rem; } app-item-image { margin-right: -.5rem; border: 2px solid white; border-radius: 50%; }`]
})
export class ItemImageStack {
  readonly items = input.required<readonly { id: string; name: string; imageUrl?: string | null }[]>();
  readonly visible = computed(() => [...new Map(this.items().map(item => [item.id, item])).values()].slice(0, 3));
}
