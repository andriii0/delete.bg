# CPU edge comparison

Three real photographs, each 1,000 pixels wide, were processed in Chrome for Testing 145.0.7632.6 on Windows with an Intel Core i7-13700. Hardware acceleration was disabled. Each run used a fresh worker and one WebAssembly thread. Timings are medians of three runs, from inference session creation through full-resolution alpha output. They exclude downloads, input decoding, PNG encoding and UI rendering. [Individual measurements in milliseconds](timings.json)

| Source | U²-Netp baseline | MODNet, 672 px | MODNet, 1,024 px + local alpha | U²-Netp + local alpha |
| --- | ---: | ---: | ---: | ---: |
| Dark locs, 1000 × 1500 | 1.09 s | 1.21 s | 2.76 s | 1.27 s |
| Fine hair, 1000 × 1271 | 1.23 s | 1.40 s | 3.02 s | 1.38 s |
| Gerbera, 1000 × 1311 | 1.25 s | 1.37 s | 2.99 s | 1.26 s |

MODNet weights are **25,888,640 bytes**. U²-Netp weights are **4,574,861 bytes**. Both use the same 11,210,254-byte WASM runtime and 69,115 bytes of runtime modules. These are file sizes before transport compression. Auto selection on this flower runs both models sequentially, about 4.25 seconds of processing from the two medians.

| Photograph | Input | Full-size editor download | Matching crops on white and black |
| --- | --- | --- | --- |
| Dark locs, Superr | [JPG](locks.jpg) | [PNG](locks-export.png) | [Four methods](locks-comparison.png) |
| Fine hair, Anastasia Tooming | [JPG](wisps.jpg) | [PNG](wisps-export.png) | [Four methods](wisps-comparison.png) |
| Pink gerbera, July Nguyen | [JPG](flower.jpg) | [PNG](flower-export.png) | [Four methods](flower-comparison.png) |

Each comparison sheet uses the same 240 × 240 source rectangle at 150% on both backgrounds. Top-left source coordinates are (105,225), (515,75) and (510,500), respectively. The file name suffixes `object`, `portrait`, `detail` and `product` correspond to the table columns in order. The `export` files came from the editor's download action with automatic selection and no manual corrections.

On the dark portrait, U²-Netp leaves a smooth fuzzy silhouette in the upper-left hair. MODNet separates more tufts. Local colour refinement breaks up part of the dark fringe on white, but the boundary remains mottled where the background and hair have similar colours. On the windswept portrait, dark clothing fades in the U²-Netp mask. MODNet keeps the clothing and more of the flyaway strands. On the gerbera, the general model keeps the long stem better than the portrait model. The shadow around some petals remains partly visible. These are visual comparisons on photographs without reference alpha mattes.

To reproduce the measurements, run `python serve.py --bench` from the project root and open [the benchmark](http://127.0.0.1:8000/examples/bench.html). Disable browser graphics acceleration and restart before measuring. The page runs the same worker as the editor. Browser cache and machine load can affect results.

[Superr on Pexels](https://www.pexels.com/photo/36041529/) · [Anastasia Tooming on Pexels](https://www.pexels.com/photo/11491188/) · [July Nguyen on Pexels](https://www.pexels.com/photo/30811092/) · [Photo license](https://www.pexels.com/license/)

