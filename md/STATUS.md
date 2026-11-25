# delete.bg status

The production site is the `site/` directory. The landing page, direct editor route, CPU inference, alpha editor, local draft and clipboard/download export are implemented. The Pages workflow publishes this directory from the standalone repository's `main` branch.

Chrome for Testing 145 and Microsoft Edge 158 on Windows passed the upload, editing, history and PNG export scenarios with GPU acceleration disabled. A Chrome-to-Edge system clipboard round trip preserved every RGBA pixel of the 1,000 × 1,500 dark portrait. The fine-hair export also matched the clipboard image in each browser. Matching includes semi-transparent pixels and composites on black and white.

The quality comparison covers three photographs. Difficult low-contrast hair can retain a mottled edge. Auto selection uses framing and can require a manual model override. See the [comparison and reproducible timings](../examples/README.md) and [publication instructions](../README.md#publish-to-github-pages).
