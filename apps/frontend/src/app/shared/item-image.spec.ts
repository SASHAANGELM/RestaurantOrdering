import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ItemImage } from './item-image';

describe('item image', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('renders a labelled food placeholder without requesting a photo for missing images', () => {
    const fixture = TestBed.createComponent(ItemImage); fixture.componentRef.setInput('name', 'Soup');
    for (const src of [undefined, null, '']) {
      fixture.componentRef.setInput('src', src); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('img')).toBeNull();
      expect(fixture.nativeElement.querySelector('[role=img]').getAttribute('aria-label')).toBe('Soup — no image available');
      expect(fixture.nativeElement.querySelector('.ti-tools-kitchen-2')).not.toBeNull();
    }
  });
  it('normalizes legacy paths, falls back on a broken image and recovers when its source changes', () => {
    const fixture = TestBed.createComponent(ItemImage); fixture.componentRef.setInput('name', 'Soup');
    fixture.componentRef.setInput('src', '/images/missing.jpg'); fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/api/images/missing.jpg');
    image.dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.placeholder')).not.toBeNull();
    fixture.componentRef.setInput('src', '/api/images/soup.jpg'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('/api/images/soup.jpg');
  });
});
