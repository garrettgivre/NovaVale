# Full 3D shape of a character from its turnaround views (Hunyuan3D-2mv, shape only): python gen.py <who> [steps] [octree]
import sys, os, time, torch
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Hunyuan3D-2'))
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
FIG = 'C:/Users/Garrett/Documents/Nova-Vale-Aquadome/tools/figures'
who = sys.argv[1]; steps = int(sys.argv[2]) if len(sys.argv) > 2 else 30; octree = int(sys.argv[3]) if len(sys.argv) > 3 else 380
import json
cfg = json.load(open(f'{FIG}/{who}.json'))
left = 'side' if cfg.get('sideFaces', 'left') == 'left' else 'side2'      # the model's "left" view has the nose pointing left
right = 'side2' if left == 'side' else 'side'
images = {'front': 'front', 'left': left, 'back': 'back'}
if os.path.exists(f'{FIG}/{who}_{right}.png') and '--3' not in sys.argv: images['right'] = right
images = {k: Image.open(f'{FIG}/{who}_{v}.png').convert('RGBA') for k, v in images.items()}
# The stock loader builds every network in 32-bit and reads the whole 5 GB checkpoint beside them: more memory than
# this laptop can commit (16 GB RAM, small page file). Build each part empty and hand it its half-precision weights.
import yaml, glob
from safetensors import safe_open
from accelerate import init_empty_weights
from huggingface_hub import snapshot_download
from hy3dgen.shapegen.pipelines import instantiate_from_config
root = os.path.join(snapshot_download('tencent/Hunyuan3D-2mv', allow_patterns=['hunyuan3d-dit-v2-mv/*']), 'hunyuan3d-dit-v2-mv')
config = yaml.safe_load(open(os.path.join(root, 'config.yaml'))); ckpt = os.path.join(root, 'model.fp16.safetensors')
def part(nm):   # one network, built empty and filled straight onto the GPU
    with init_empty_weights(): mod = instantiate_from_config(config[nm])
    sd = {}
    with safe_open(ckpt, 'pt', device='cuda') as f:
        for k in f.keys():
            if k.startswith(nm + '.'): sd[k[len(nm) + 1:]] = f.get_tensor(k)
    miss = mod.load_state_dict(sd, strict=False, assign=True)
    for m_ in mod.modules():
        for k, b in m_._buffers.items():
            if b is not None and not b.is_meta and b.device.type == 'cpu': m_._buffers[k] = b.to('cuda', torch.float16 if b.is_floating_point() else b.dtype)
    print(nm, len(sd), 'tensors; missing', len(miss.missing_keys), flush=True)
    return mod.eval()
# only one of the two big networks is on the GPU at a time (6 GB card): the image encoder first, then the shape model
pipe = object.__new__(Hunyuan3DDiTFlowMatchingPipeline)
pipe.kwargs = {}; pipe.device = torch.device('cuda'); pipe.dtype = torch.float16
pipe.scheduler = instantiate_from_config(config['scheduler']); pipe.image_processor = instantiate_from_config(config['image_processor'])
pipe.vae = part('vae'); pipe.conditioner = part('conditioner')
with init_empty_weights(): pipe.model = instantiate_from_config(config['model'])
enc = pipe.encode_cond
def encode_then_swap(*a, **k):
    out = enc(*a, **k)
    pipe.conditioner = None; import gc; gc.collect(); torch.cuda.empty_cache()
    pipe.model = part('model'); return out
pipe.encode_cond = encode_then_swap
t = time.time()
mesh = pipe(image=images, num_inference_steps=steps, octree_resolution=octree, num_chunks=8000, generator=torch.manual_seed(12345), output_type='trimesh')[0]
print('generated in', round(time.time() - t), 's;', len(mesh.vertices), 'verts', len(mesh.faces), 'faces; bounds', mesh.bounds.tolist())
os.makedirs('out', exist_ok=True); mesh.export(f'out/{who}.glb'); print('SAVED')
