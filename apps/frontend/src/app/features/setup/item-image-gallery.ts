import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ItemImage } from '../../shared/item-image';

/** The prototype ships this fixed collection; no upload or deletion API exists. */
export const ITEM_IMAGES = ['bread', 'breakfast', 'burger', 'cake', 'coffee', 'ice-cream', 'juice', 'pasta', 'pizza', 'salad', 'soup', 'vegetables']
  .map((filename) => ({ url: `/api/images/${filename}.jpg`, name: filename === 'ice-cream' ? 'Ice cream' : filename[0]!.toUpperCase() + filename.slice(1) }));

@Component({
  selector: 'app-item-image-gallery',
  imports: [MatButton, MatDialogModule, ItemImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title id="image-gallery-title">Choose item image</h2>
    <mat-dialog-content>
      <p id="gallery-help">Select an image or choose No image.</p>
      <div class="image-grid" role="group" aria-label="Available item images" aria-describedby="gallery-help">
        <button type="button" class="image-option" aria-label="No image" [attr.aria-pressed]="!selected" (click)="dialog.close('')">
          <app-item-image class="gallery" src="" name="No image" /><span>No image</span>
        </button>
        @for (image of images; track image.url) {
          <button type="button" class="image-option" [attr.aria-label]="image.name" [attr.aria-pressed]="selected === image.url" (click)="dialog.close(image.url)">
            <app-item-image class="gallery" [src]="image.url" [name]="image.name" /><span>{{ image.name }}</span>
          </button>
        }
        <button type="button" class="image-option add-image" disabled aria-label="Add image" aria-describedby="prototype-image-help" title="Adding or removing images is unavailable in this prototype.">
          <span class="plus"><i class="ti ti-plus" aria-hidden="true"></i></span><span>Add image</span>
        </button>
      </div>
      <p id="prototype-image-help" class="muted">Adding or removing images is unavailable in this prototype. Choose from the included images.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Cancel</button></mat-dialog-actions>
  `,
  styles: [`
    .image-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; }
    .image-option { display: grid; gap: .5rem; padding: .35rem; min-width: 0; border: 2px solid transparent; border-radius: .65rem; background: #f1f5f8; color: #20303c; font: inherit; font-size: .8rem; cursor: pointer; }
    .image-option[aria-pressed="true"] { border-color: #2c6c93; background: #e3eff7; } .image-option:hover:not(:disabled) { background: #dcebf4; }
    .plus { display: grid; place-items: center; width: 100%; aspect-ratio: 1; background: #2c6c931a; border-radius: .35rem; font-size: 2rem; }
    .add-image:disabled { opacity: .5; cursor: not-allowed; }
    #prototype-image-help { font-size: .85rem; margin-bottom: 0; }
    @media (max-width: 650px) { .image-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; } }
  `]
})
export class ItemImageGallery {
  readonly selected = inject<string>(MAT_DIALOG_DATA).replace(/^\/images\//, '/api/images/');
  readonly dialog = inject(MatDialogRef<ItemImageGallery, string>);
  readonly images = ITEM_IMAGES;
}
