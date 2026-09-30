# Stamp a new version on everything the browser caches, so a normal refresh picks up a new deploy.
# GitHub Pages lets browsers keep files for 10 minutes; without this a refresh can run old code and old models.
# Run before committing changes to js/, css/ or assets/figures/:  python tools/bump.py
import os, re, json, time
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = time.strftime('%Y%m%d%H%M')
js = sorted(f for f in os.listdir(os.path.join(R, 'js')) if f.endswith('.js'))
imports = {'three': './vendor/three.module.min.js'}
imports.update({f'./js/{f}': f'./js/{f}?v={V}' for f in js})
p = os.path.join(R, 'index.html'); s = open(p, encoding='utf8').read()
s = re.sub(r'<script type="importmap">.*?</script>', '<script type="importmap">' + json.dumps({'imports': imports}) + '</script>', s, flags=re.S)
s = re.sub(r'src="js/main\.js(\?v=\d+)?"', f'src="js/main.js?v={V}"', s)
s = re.sub(r'href="css/style\.css(\?v=\d+)?"', f'href="css/style.css?v={V}"', s)
open(p, 'w', encoding='utf8').write(s)
p = os.path.join(R, 'js', 'figures.js'); s = open(p, encoding='utf8').read()
s = re.sub(r"export const ASSET_V = '\d*';", f"export const ASSET_V = '{V}';", s)
open(p, 'w', encoding='utf8').write(s)
print('version', V)
