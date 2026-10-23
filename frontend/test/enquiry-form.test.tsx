import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EnquiryForm } from '../src/Landing/EnquiryForm';

it('provides bounded contact fields, explicit consent and a secret-data warning', () => {
  const html = renderToStaticMarkup(<EnquiryForm/>);
  for (const field of ['name','email','category','message','contactConsent','website']) expect(html).toContain(`name="${field}"`);
  expect(html).toContain('maxLength="4000"');
  expect(html).toContain('type="email"');
  expect(html).toContain('Never include passwords, recovery keys or vault contents.');
  expect(html).toContain('does not subscribe you to marketing emails');
  expect(html).not.toContain('firebase');
});
