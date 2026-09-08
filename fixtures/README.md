# Test fixtures

`qa-test-page.html` is a deliberately broken page used to verify the acceptance
criteria in `CONTEXT.md` without depending on a live client site.

It contains, on purpose:

| Problem | Expected finding |
| --- | --- |
| Four font families, 10px text, 1.1x line-height | `typography` warnings |
| `./does-not-exist.png` | `image` error (HTTP 404) |
| An `<img>` with no `alt` attribute | `alt` error (and an axe `image-alt` violation) |
| A large image with `alt=""` | `alt` warning |
| One paragraph repeated in two sections | `duplicate-text` warning |
| Two identical `<article>` cards | `duplicate-section` warning |
| `<h2>` followed by `<h4>` | `heading` skipped-level warning |
| A `23px` section gap | `spacing` info, when rhythm reporting is enabled |
| The same paragraph in `<nav>` and `<footer>` | **no** finding - boilerplate is ignored |

Serve it over HTTP (the broken-image check needs a real request):

```bash
npx serve fixtures    # or: python -m http.server 4000 -d fixtures
```

Then render `http://localhost:3000/qa-test-page.html` in the app.
