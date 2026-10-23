import { describe, expect, it } from 'vitest';
import { parseCardText, validCardNumber } from '../src/features/vault/cardOcrParser';

describe('local card OCR suggestions', () => {
  it('extracts a grouped test number, name and expiry without extracting CVV', () => {
    expect(parseCardText('VISA\n4111 1111 1111 1111\nVALID THRU 09/2029\nJANE DOE\n123')).toEqual({
      number: '4111111111111111', cardholder: 'JANE DOE', expiry: '09/29',
    });
  });
  it('leaves ambiguous numbers and names for manual entry', () => {
    expect(parseCardText('4111111111111111\n5555555555554444\nJANE DOE\nJOHN DOE')).toEqual({ number: '', cardholder: '', expiry: '' });
  });
  it('does not fabricate details from unreadable text or bank branding', () => {
    expect(parseCardText('VISA\nEXAMPLE BANK\n@#$')).toEqual({ number: '', cardholder: '', expiry: '' });
  });
  it('flags invalid checksums and repeated digits', () => {
    expect(validCardNumber('4111 1111 1111 1111')).toBe(true);
    expect(validCardNumber('4111111111111112')).toBe(false);
    expect(validCardNumber('0000000000000000')).toBe(false);
  });
  it('prefers a labelled expiry over a valid-from date and leaves ambiguous dates blank', () => {
    expect(parseCardText('VALID FROM 01/24\nVALID THRU 09/29').expiry).toBe('09/29');
    expect(parseCardText('01/24\n09/29').expiry).toBe('');
  });
});
