# delete.bg status

The app runs directly from `site/`. The Pages workflow packages it with versioned asset URLs, checks the model hashes and exercises the release in headless Chrome before deployment. Run `python tests/browser.py --browser <executable>` to test locally.

Chrome for Testing 145 and Edge 158 on Windows passed the CPU-only browser suite, including older draft migration, separate drafts in duplicate tabs, retry after PNG encoding failure and replacement of a corrupt cached model. In both browsers, the clipboard round trip for the fine-hair portrait matched the downloaded PNG pixel for pixel.

Auto evaluates the general mask first. When the general and portrait models identify the same subject but each includes areas the other misses, Auto retries the portrait model with the likely background muted. It accepts the new mask if it still matches the portrait and overlaps the general mask more closely. Low-contrast hair and petal shadows can still need manual correction. See the [sample PNGs and baseline timings](../examples/README.md) and [publication instructions](../README.md#publish-to-github-pages).
