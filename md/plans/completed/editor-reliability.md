# Editor reliability

- Make soft strokes independent of pointer sampling. Support off-image starts, keyboard panning and two-finger navigation without committing a mark.
- Isolate drafts across tabs, preserve older drafts, write changed mask regions and support expiry and explicit deletion.
- Gate export during inference, retry failed encoding and reject oversized images before allocating editor canvases.
- Validate cached inference bytes, compare foreground geometry across the image and refine edge colours while keeping restoration and history reversible.
- Use explicit localization bindings and consistent release URLs across entry points and worker imports.
- Verify these paths with automated browser regressions, exercise all three sample photos on CPU, and include the checks in the Pages workflow.

The browser suite passes in Chrome and Edge with GPU acceleration disabled. The edited PNGs, draft migration and duplicate-tab isolation are covered alongside the model selection and brush regressions.
