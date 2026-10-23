# Local card scanning

Payment card items offer **Scan card** for JPG, PNG and WebP images up to 10 MB.
The image picker can offer camera capture on supported mobile devices. OCR runs
in a Tesseract.js web worker on the device. Only reviewed fields are applied to
the editor; saving uses the existing encrypted item flow. Images and raw OCR
text are never sent to the API, logged, or stored by this feature. CVV and PIN
are not extracted.

The npm predev/prebuild scripts copy the worker, WebAssembly cores and English
model from installed packages into ignored `public/ocr/`. Production serves
these files from the app origin; no OCR CDN or remote OCR service is used.
Restart an already running dev server after installing this change.

Scanning suggests fields and may miss embossed, reflective, rotated or unusual
card layouts. Check every field before applying. Ambiguous numbers or names
are left blank. Number checksum validation is a warning, not proof of accuracy.
Test with representative physical cards and mobile browsers before release.
