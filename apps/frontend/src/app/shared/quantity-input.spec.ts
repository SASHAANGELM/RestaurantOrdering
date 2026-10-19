import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuantityInput } from './quantity-input';

describe('quantity input', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('exposes large labelled number input and prevents stepping outside the ordering bounds', () => {
    const fixture = TestBed.createComponent(QuantityInput);
    fixture.componentRef.setInput('label', 'Soup quantity');
    const changed = vi.fn(); fixture.componentInstance.valueChange.subscribe(changed);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('input')?.getAttribute('type')).toBe('number');
    expect(root.querySelector('input')?.getAttribute('aria-label')).toBe('Soup quantity');
    const [minus, plus] = root.querySelectorAll('button');
    expect(minus?.disabled).toBe(true); plus?.click(); expect(changed).toHaveBeenLastCalledWith('2');
    fixture.componentRef.setInput('value', '99'); fixture.detectChanges();
    expect(plus?.disabled).toBe(true); minus?.click(); expect(changed).toHaveBeenLastCalledWith('98');
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    expect(root.querySelector('input')?.disabled).toBe(true); expect(minus?.disabled).toBe(true);
    fixture.componentInstance.step(-1); expect(changed).toHaveBeenCalledTimes(2);
  });
  it('retains invalid typed drafts for validation and recovers with a step button', () => {
    const fixture = TestBed.createComponent(QuantityInput); const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed); fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = '0'; input.dispatchEvent(new Event('input'));
    expect(changed).toHaveBeenLastCalledWith('0');
    fixture.componentRef.setInput('value', '0'); fixture.detectChanges();
    fixture.componentInstance.step(1); expect(changed).toHaveBeenLastCalledWith('1');
  });
});
