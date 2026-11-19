"""Export the photographed front view, its textured GLB and responsive cutouts.

Run with Python 3.11+, Pillow and NumPy. The source directory must contain
the six isolated, straight-alpha studio PNGs named after their product slugs.
"""

import argparse
import io
import json
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


OUT = Path(__file__).resolve().parents[2] / 'public' / 'showcase'
SLUGS = ['arandanos-perlas', 'purple-crispy', 'fresa-vodka', 'jack-bacon', 'margarita-tequila', 'atlantica']
DRINKS = set(SLUGS[::2])


class GLB:
    """Small glTF 2.0 writer for indexed solids with optional embedded texture."""

    def __init__(self):
        self.data = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'Purple product studio'}, 'scene': 0,
                    'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [],
                    'bufferViews': [], 'accessors': [], 'buffers': []}

    def view(self, data, target=None):
        self.data.extend(b'\0' * (-len(self.data) % 4))
        offset = len(self.data)
        self.data.extend(data)
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        if target:
            view['target'] = target
        self.doc['bufferViews'].append(view)
        return len(self.doc['bufferViews']) - 1

    def accessor(self, array, component_type, kind, target, bounds=False, normalized=False):
        accessor = {'bufferView': self.view(np.ascontiguousarray(array).tobytes(), target),
                    'componentType': component_type, 'count': len(array), 'type': kind}
        if bounds:
            accessor.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        if normalized:
            accessor['normalized'] = True
        self.doc['accessors'].append(accessor)
        return len(self.doc['accessors']) - 1

    def material(self, name, roughness=0.55, metallic=0., texture=None):
        pbr = {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': metallic, 'roughnessFactor': roughness}
        material = {'name': name, 'pbrMetallicRoughness': pbr, 'doubleSided': True}
        if texture is not None:
            png = io.BytesIO()
            texture.save(png, format='PNG', compress_level=7)
            self.doc['images'] = [{'bufferView': self.view(png.getvalue()), 'mimeType': 'image/png'}]
            self.doc['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
            self.doc['textures'] = [{'source': 0, 'sampler': 0}]
            pbr['baseColorTexture'] = {'index': 0}
            material.update(alphaMode='MASK', alphaCutoff=.31, extensions={'KHR_materials_unlit': {}})
            self.doc['extensionsUsed'] = ['KHR_materials_unlit']
        self.doc['materials'].append(material)
        return len(self.doc['materials'])-1

    def primitive(self, positions, normals, indices, material, colors=None, uv=None):
        pos = np.array(positions, dtype='<f4'); normals = np.array(normals, dtype='<f4')
        attr = {'POSITION': self.accessor(pos, 5126, 'VEC3', 34962, True),
                'NORMAL': self.accessor(normals, 5126, 'VEC3', 34962)}
        if colors is not None:
            rgb = np.clip(np.rint(colors*255), 0, 255).astype(np.uint8)
            color = np.full((len(rgb), 4), 255, dtype=np.uint8); color[:,:3] = rgb
            attr['COLOR_0'] = self.accessor(color, 5121, 'VEC4', 34962, normalized=True)
        if uv is not None:
            attr['TEXCOORD_0'] = self.accessor(np.array(uv, dtype='<f4'), 5126, 'VEC2', 34962)
        large = len(positions)>65535
        idx = np.asarray(indices, dtype='<u4' if large else '<u2').flatten()
        return {'attributes': attr, 'indices': self.accessor(idx, 5125 if large else 5123, 'SCALAR',34963), 'material':material}

    def mesh(self, name, primitives):
        self.doc['meshes'].append({'name':name, 'primitives':primitives})
        self.doc['nodes'].append({'name':name, 'mesh':len(self.doc['meshes'])-1})
        self.doc['scenes'][0]['nodes'].append(len(self.doc['nodes'])-1)

    def write(self, path):
        self.data.extend(b'\0' * (-len(self.data) % 4))
        self.doc['buffers'].append({'byteLength':len(self.data)})
        desc = json.dumps(self.doc, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        desc += b' ' * (-len(desc) % 4)
        with path.open('wb') as file:
            file.write(struct.pack('<4sII', b'glTF', 2, 28+len(desc)+len(self.data)))
            file.write(struct.pack('<I4s',len(desc),b'JSON')); file.write(desc)
            file.write(struct.pack('<I4s',len(self.data),b'BIN\0')); file.write(self.data)


def profile_model(image, slug, dst):
    texture = image.copy()
    texture.thumbnail((840, 1050), Image.Resampling.LANCZOS)
    rgba = np.asarray(texture)
    mask = rgba[:,:,3] > 128
    rows = np.flatnonzero(mask.any(axis=1))
    top, bottom = int(rows[0]), int(rows[-1]); h, w = mask.shape
    count = 104; rings = 139
    ys = np.unique(np.round(np.linspace(bottom, top, rings)).astype(int))[::-1]
    theta=np.arange(count)*math.tau/count
    vertices=[]; uv=[]; faces=[]
    scale=max(np.ptp(np.flatnonzero(mask.any(axis=0))), bottom-top)/2
    for y in ys:
        nearest = rows[np.argmin(abs(rows-y))]
        xs = np.flatnonzero(mask[nearest]); left, right = xs[0], xs[-1]
        rx=max((right-left)/2,.55); cx=(right+left)/2
        x=cx+rx*np.sin(theta)
        depth = (.92 if slug in DRINKS else .81)*rx
        z=depth*np.cos(theta)
        vertices.extend(np.stack(((x-(w-1)/2)/scale, np.full(count,((h-1)/2-y)/scale), z/scale),axis=1))
        uv.extend(np.stack(((x+.5)/w, np.full(count,(y+.5)/h)),axis=1))
    for j in range(len(ys)-1):
        for i in range(count):
            a=j*count+i;b=j*count+(i+1)%count
            faces.extend([(a,b,a+count),(b,b+count,a+count)])
    p=np.asarray(vertices); idx=np.asarray(faces); n=vertex_normals(p,idx)
    glb=GLB(); mat=glb.material('Textura de la vista frontal',texture=texture)
    glb.mesh(slug,[glb.primitive(p,n,idx,mat,uv=np.asarray(uv))]); glb.write(dst)


def vertex_normals(p, idx):
    edge=np.cross(p[idx[:,1]]-p[idx[:,0]],p[idx[:,2]]-p[idx[:,0]])
    result=np.zeros_like(p)
    for col in range(3):
        np.add.at(result,idx[:,col],edge)
    return result / np.maximum(np.linalg.norm(result,axis=1,keepdims=True),1e-9)


def isolated(image):
    image=ImageOps.exif_transpose(image).convert('RGBA')
    alpha=image.getchannel('A')
    if alpha.getextrema()[0] != 0:
        raise ValueError('The source is missing the transparent background')
    bounds=alpha.point(lambda value: 255 if value>20 else 0).getbbox()
    x0,y0,x1,y1=bounds
    pad=max(2,round(max(x1-x0,y1-y0)*.012))
    return image.crop((x0-pad,y0-pad,x1+pad,y1+pad))


def scaled(image,max_edge):
    factor=max_edge/max(image.size)
    return image.resize(tuple(max(1,round(x*factor)) for x in image.size),Image.Resampling.LANCZOS)


def run(source,slugs):
    (OUT/'products').mkdir(parents=True,exist_ok=True); (OUT/'masters').mkdir(exist_ok=True)
    meta_path=OUT/'products'/'art.json'
    measures=json.loads(meta_path.read_text(encoding='utf8')) if meta_path.exists() else {}
    for slug in slugs:
        with Image.open(source/(slug+'.png')) as raw:
            source_size=raw.size
            image=isolated(raw)
        web=scaled(image,min(1200,max(image.size))); sm=scaled(image,510)
        web.save(OUT/'products'/(slug+'.webp'),format='WEBP',quality=92,method=5)
        sm.save(OUT/'products'/(slug+'-sm.webp'),format='WEBP',quality=86,method=5)
        master=scaled(image,3840)
        master.save(OUT/'masters'/(slug+'.png'),format='PNG',compress_level=6)
        profile_model(image,slug,OUT/'products'/(slug+'.glb'))
        measures[slug]={'sourceSize':list(source_size),'masterSize':list(master.size),'imageSize':list(web.size),'smallSize':list(sm.size)}
        meta_path.write_text(json.dumps(measures,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
        print(slug, measures[slug],flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path); parser.add_argument('slugs',nargs='*')
    args=parser.parse_args(); run(args.source,args.slugs or SLUGS)
