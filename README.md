# delete.bg

[Open the app](https://andriii0.github.io/delete.bg/) · [Open the editor](https://andriii0.github.io/delete.bg/editor/)

A free, browser-based photo cutout editor. It runs on a CPU in Chrome and Edge on Windows. The static site and its inference assets are self-contained. Photos stay in the browser.

## Local use

From the directory containing this README, run the following with Python 3.

```console
python serve.py
```

Open [the landing page](http://127.0.0.1:8000/) or [the editor](http://127.0.0.1:8000/editor/). On Windows, `py serve.py` also works. The server binds to loopback and supplies the correct JavaScript module and WebAssembly MIME types. The shipped `site/` directory is the production build. It needs no install or compilation.

## Publish to GitHub Pages

1. Create a **public** GitHub repository with `main` as its default branch. Place the contents of this project at the repository root, including the hidden `.github` directory. The workflow and `site` should be siblings of this README.
2. In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
3. Push to `main`, or choose **Actions → Publish delete.bg → Run workflow**. The workflow runs `python verify.py` to verify the five inference assets and HTML links, then publishes `site/`. The deployment summary contains the public URL.
4. Open `https://USERNAME.github.io/REPOSITORY/` and `https://USERNAME.github.io/REPOSITORY/editor/`. Both routes have their own index file. All runtime URLs resolve inside the project directory.

The published site occupies about **42.2 MB**, below the 1 GB site limit. The largest file is 25.9 MB. A cold visit that uses both models requires about 41.7 MB of inference assets before HTTP compression. At that transfer size, 2,300 fully cold sessions use about 96 GB. Actual traffic includes page assets and depends on caching, compression and repeat use. The examples directory stays outside the published site. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) · [Pages deployment workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Edit and export

Click anywhere in the upload area, drop a file, or press Ctrl+V. The editor opens the photo and starts processing. The landing page downloads only its UI and a draggable original/cutout preview.

Use **Original / Cutout** to compare at the same zoom and position. **Pan** pans by dragging. The middle mouse button or Space-drag also pans while editing. The checkerboard, white and black swatches change the preview background.

**Erase** edits transparency. **Restore** restores the source pixels and shows a 25% original underneath. Drag the brush for a stroke, outline a freehand selection with the lasso, drag a circle from its centre, or drag between opposite rectangle corners. Release to apply the shape. Escape cancels an unfinished gesture and exits manual editing. Diameter is in source pixels. The preview ring follows that diameter at every zoom.

Each gesture and each automatic result is one undo step. Ctrl+Z undoes and Ctrl+Shift+Z or Ctrl+Y redoes. A new edit clears redo. Starting a manual gesture cancels a pending automatic pass. **Apply** runs the selected model again. The undo buffer retains up to 96 MiB of recent alpha changes, with room for at least the latest edit.

**Copy PNG** (Ctrl+C) and **Download PNG** encode the result canvas at source resolution, including alpha. Preview layers have separate canvases or CSS backgrounds. Clipboard operations require HTTPS or localhost and the browser's clipboard permission. Native Ctrl+V and the file chooser also accept images when clipboard reading by a button is denied.

The current tab keeps its source photo and latest alpha mask in local IndexedDB for refresh. Undo history lives in memory. Opening another photo replaces that tab's draft. Saving a new photo also removes draft entries older than seven days. Clearing the site's browser data removes drafts and model caches.

## Inference

The worker uses ONNX Runtime Web 1.22.0 with a single WebAssembly SIMD thread. This path works with browser hardware acceleration disabled and ordinary GitHub Pages headers. The worker reports model and WebAssembly downloads separately and stores both in Cache Storage when available.

**Portrait & hair** uses MODNet with a 1,024-pixel long side. **Object** uses U²-Netp at 320 × 320. Each predicts an initial mask. In its uncertain band, the worker estimates transparency using nearby foreground and background colours at source resolution. It limits the correction in textured regions and where the colours are too similar. Source alpha bounds the final opacity. The RGB channels retain the source colours, so colour spill and ambiguous fine edges may remain.

**Auto** starts with the portrait model. If fewer than 12% of bottom-row pixels have alpha above 220, it runs the general model for an isolated subject. This framing heuristic can misclassify a full-body portrait or an object that spans the bottom edge. Either model can be selected explicitly. A failed model download leaves the original available to every manual tool.

[CPU comparison, timings, crops and exports](examples/README.md) · [Model and photo credits](site/licenses/index.html)


