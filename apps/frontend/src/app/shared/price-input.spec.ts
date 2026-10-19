import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PriceInput } from './price-input';

describe('price input', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('steps exact cents in dollars and clamps zero and the maximum without mutating disabled fields', () => {
    const fixture = TestBed.createComponent(PriceInput); const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed); fixture.componentRef.setInput('value', '0.29'); fixture.detectChanges();
    fixture.componentInstance.step(100); expect(changed).toHaveBeenLastCalledWith('1.29');
    fixture.componentInstance.step(-100); expect(changed).toHaveBeenLastCalledWith('0.00');
    fixture.componentRef.setInput('value', '9999.99'); fixture.detectChanges();
    fixture.componentInstance.step(100); expect(changed).toHaveBeenLastCalledWith('10000.00');
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    fixture.componentInstance.step(-100); expect(changed).toHaveBeenCalledTimes(3);
  });
  it('retains malformed decimal drafts for validation instead of rounding them', () => {
    const fixture = TestBed.createComponent(PriceInput); const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed); fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = '1.234'; input.dispatchEvent(new Event('input'));
    expect(changed).toHaveBeenCalledWith('1.234');
  });
  it('normalizes decimal commas in both the emitted draft and the visible input, even when the model is unchanged', () => {
    const fixture = TestBed.createComponent(PriceInput); const changed = vi.fn();
    fixture.componentRef.setInput('value', '1.00'); fixture.componentInstance.valueChange.subscribe(changed); fixture.detectChanges();
    const field: HTMLInputElement = fixture.nativeElement.querySelector('input');
    for (const draft of ['1,00', '1.00']) {
      field.value = draft; field.dispatchEvent(new Event('input')); fixture.detectChanges();
      expect(field.value).toBe('1.00'); expect(changed).toHaveBeenLastCalledWith('1.00');
    }
    field.value = '1,234'; field.dispatchEvent(new Event('input'));
    expect(field.value).toBe('1.234'); expect(changed).toHaveBeenLastCalledWith('1.234');
  });
});
