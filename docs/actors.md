# الشخصيات / Character assets

`public/actors/sumer.glb` is an editable, locally served glTF 2.0 binary. The project authored Sumer's fictional appearance, costume, eyes, hair cap, short beard, equipment, rig and twelve animation clips. His layered outfit includes a woven neck cloth, linen shirt, work vest, leather shoulder bag, trousers and laced boots. Civilian variants 0 and 2 use the separately sculpted and dressed female survivor in `public/actors/survivor.glb`, with an open-front woven head covering and long skirt. Other roles share Sumer’s mesh with costume palettes and different proportions. Both models contain the same animation library. Fabric colors and proportions vary between roles. These figures depict fictional people.

The underlying head, neck and hands were adapted from **MakeHuman HM08** and MakeHuman male and female morphology targets. The body OBJ header explicitly releases the asset under CC0 and names Data Collection AB, Joel Palmius and Jonas Hauquier. The upstream asset license is included verbatim in `public/actors/MakeHuman-CC0.txt`. The game distributes only the transformed, dressed GLB.

- [HM08 source, pinned revision](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/3dobjs/base.obj)
- [Morphology sources](https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/targets/macrodetails)
- [Original CC0 license](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.ASSETS.md)

Character animation clips are named `idle`, `walk`, `run`, `sprint`, `jump`, `crouch`, `interact`, `climb`, `help`, `carry`, `cover` and `signal`. The figures face +Z, use meters and have a floor-level origin. Skeletal animations run in place so the movement controller owns world travel. The material palette and skeleton are editable in Blender. Skin shading and beard strokes use vertex colors. There is no photographic portrait, external model server or runtime texture dependency.

تستخدم الشخصيات مجسّماً محلياً ذا هيكل عظمي متحرك. الملابس والتجهيزات والحركات صُمّمت للعبة. تستند هندسة الوجه واليدين إلى أصول MakeHuman المتاحة بترخيص CC0. سومر والمدنيون شخصيات خيالية.

### Rebuilding the editable assets

The GLBs include unbaked skeletons, PBR materials, independent cloth textures and two subtle facial morph targets (`blink` and `concern`). Both the mesh and action tracks can be opened and edited directly in Blender. For deterministic regeneration from the original tailoring and authored motion curves, use Python 3.12 in a virtual environment:

```sh
python -m pip install -r tools/actors/requirements.txt
python tools/actors/rebuild.py
```

The optional authoring command downloads the pinned, checksum-verified CC0 mesh and targets into a temporary directory. The browser build uses the checked-in GLBs and requires no Python or source-art download. The model generator creates the woven PBR maps locally. Their noise generator is seeded.

Khronos glTF Validator reported zero errors and zero warnings for both shipped model files. Sumer contains 30,544 triangles and the female survivor contains 31,542.
