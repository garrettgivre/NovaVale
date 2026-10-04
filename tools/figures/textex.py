# One baked texture for a character's fitted 3D shape (Hunyuan3D-Paint, run locally): python tex.py <who>
# Reads tools/figures/<who>_fit.obj and the front view; writes <who>_gentex.png and <who>_gentex.npz (UVs per face corner).
import sys, os, time, json, numpy as np, torch
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Hunyuan3D-2')); sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'libs'))   # own diffusers/transformers (the borrowed venv's pair don't match)
import trimesh
from PIL import Image
FIG = 'C:/Users/Garrett/Documents/Nova-Vale-Aquadome/tools/figures'
who = sys.argv[1]
from hy3dgen.texgen import pipelines as TP
from hy3dgen.texgen.differentiable_renderer.mesh_render import MeshRender
import huggingface_hub
sub = os.environ.get('PAINT', 'hunyuan3d-paint-v2-0-turbo')
root = huggingface_hub.snapshot_download('tencent/Hunyuan3D-2', allow_patterns=['hunyuan3d-delight-v2-0/*', sub + '/*'], local_dir='D:/NovaFig/models/Hunyuan3D-2')   # a plain folder: the cache's symlinks need a privilege Windows withholds
import shutil   # the download puts the model's own loader back each run: lay the memory-saving one (patched in the repo copy) over it
shutil.copyfile(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Hunyuan3D-2/hy3dgen/texgen/hunyuanpaint/unet/modules.py'), os.path.join(root, sub, 'unet', 'modules.py'))
cfg = TP.Hunyuan3DTexGenConfig(os.path.join(root, 'hunyuan3d-delight-v2-0'), os.path.join(root, sub), sub)
cfg.device = 'cpu'                       # load on the CPU; each network visits the 6 GB GPU in turn (offload below)
pipe = object.__new__(TP.Hunyuan3DPaintPipeline); pipe.config = cfg; pipe.models = {}
pipe.render = MeshRender(default_resolution=cfg.render_size, texture_size=cfg.texture_size, device='cpu')   # the rasterizer here is CPU-only
# one network in memory at a time (16 GB RAM and a small page file: loading both crashed): first the one that takes the
# painted lighting out of the reference picture, then, with that gone, the one that paints the views
import gc
img = Image.open(f'{FIG}/{who}_front.png').convert('RGBA')
if not os.path.exists(f'{FIG}/{who}_delit.png'):      # in a run of its own, so all of its memory is given back
    dl = TP.Light_Shadow_Remover(cfg); dl.device = 'cuda'; dl.pipeline.enable_model_cpu_offload()
    dl(pipe.recenter_image(img)).save(f'{FIG}/{who}_delit.png'); print('reference prepared', flush=True)
    print('run again for the texture'); os._exit(0)     # (a child process while this one still held its network ran out of memory)
ref = Image.open(f'{FIG}/{who}_delit.png')
pipe.recenter_image = lambda im: im; pipe.models['delight_model'] = lambda im: im
mv = TP.Multiview_Diffusion_Net(cfg); mv.device = 'cuda'; mv.pipeline.enable_model_cpu_offload(); pipe.models['multiview_model'] = mv
# once on the GPU the big network stays there: handing it back to RAM for the small decoder's turn crashed
_un = mv.pipeline.unet; _to = _un.to
_un.to = lambda *a, **k: _un if (a and str(a[0]) == 'cpu') else _to(*a, **k)
try: mv.pipeline.vae.enable_slicing()
except Exception as e: print('no vae slicing', e)
mv.pipeline.maybe_free_model_hooks = lambda: None   # (moving everything back to RAM at the end crashed for lack of memory; nothing runs after it)
print('models loaded', flush=True)
# the shape with its UVs (unwrapped in Blender by tools/figures/uv_blend.py), every face on its own three vertices
U = np.load(f'{FIG}/{who}_uv.npz'); V0, F0, cuv = U['V'], U['F'], U['cuv']; nF = len(F0)
N0 = trimesh.Trimesh(V0, F0, process=False).vertex_normals
mesh = trimesh.Trimesh(V0[F0].reshape(-1, 3), np.arange(nF * 3).reshape(-1, 3), vertex_normals=N0[F0].reshape(-1, 3), process=False,
                       visual=trimesh.visual.TextureVisuals(uv=cuv.reshape(-1, 2)))
TP.mesh_uv_wrap = lambda m: m
t = time.time(); out = pipe(mesh, image=ref); print('textured in', round(time.time() - t), 's', flush=True)
tex = out.visual.material.image if hasattr(out.visual.material, 'image') else out.visual.material.baseColorTexture
tex.convert('RGB').save(f'{FIG}/{who}_gentex.png'); print('SAVED', tex.size)
