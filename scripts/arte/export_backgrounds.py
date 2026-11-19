"""Prepare the six decorative scene photographs for desktop and mobile.

Requires Pillow and NumPy. Supply the twelve ImageGen source PNGs, one wide
and one portrait composition per product, named {slug}-{wide|mobile}.png.
The optional archive contains full-size PNG exports and their source dimensions.
"""

import argparse
import io
import json
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


PUBLIC = Path(__file__).resolve().parents[2] / 'public' / 'showcase'
SCENES = {
    'arandanos-perlas': ('#AD89E5', 'arandanos'),
    'purple-crispy': ('#F3AE48', 'cebolla-crispy'),
    'fresa-vodka': ('#FF3B4B', 'fresa'),
    'jack-bacon': ('#DD7848', 'tocineta-whisky'),
    'margarita-tequila': ('#A4D92D', 'margarita'),
    'atlantica': ('#A9B65F', 'pepinillos'),
}
SIZES = {
    'wide': ((1920,1080), (3840,2160), 'horizontal'),
    'mobile': ((900,1600), (2160,3840), 'vertical'),
}


def read_material(name, size):
    """Sample actual detail from the ingredient texture used by its 3D model."""
    with Image.open(PUBLIC / 'ingredients' / f'{name}.webp') as source:
        source = source.convert('RGB')
        w,h = source.size
        interior = source.crop((w*.28,h*.32,w*.72,h*.70))
        scaled = ImageOps.fit(interior, size, Image.Resampling.LANCZOS)
    luminance = scaled.convert('L')
    broad = luminance.filter(ImageFilter.GaussianBlur(max(2,min(size)*.013)))
    grain = np.asarray(luminance,dtype=np.float32) - np.asarray(broad,dtype=np.float32)
    return np.clip(grain,-27,27)


def grade(image, slug):
    tone_hex, ingredient = SCENES[slug]
    tone = np.array(tuple(bytes.fromhex(tone_hex[1:])),dtype=np.float32)
    w,h = image.size
    rgb = np.asarray(image.convert('RGB'))
    middle = rgb[round(.34*h):round(.69*h),round(.31*w):round(.63*w)]
    source_tone = np.clip(np.median(middle.reshape(-1,3),axis=0),1,254)
    # Anchor the clear portion of the photograph to the scene palette while
    # retaining original near-black shadows and specular highlights.
    grade_tone = source_tone*.12 + tone*.88
    luts = [np.interp(np.arange(256), (0,source_tone[i],255), (0,grade_tone[i],255)) for i in range(3)]
    graded = np.stack([lut[rgb[:,:,i]] for i,lut in enumerate(luts)],axis=2).astype(np.float32)
    yy = np.linspace(0,1,h,dtype=np.float32)[:,None]
    xx = np.linspace(0,1,w,dtype=np.float32)[None,:]

    # Far-edge edible detail stays in the background plane. The interior and
    # the upper control strip preserve a comparatively even, readable field.
    corner = np.clip(((xx-.55)/.45),0,1) * np.clip((.53-yy)/.53,0,1)
    material = read_material(ingredient,(w,h))
    departure = np.linalg.norm(graded-grade_tone,axis=2)
    edible_area = np.clip((departure-15)/77,0,1)*corner
    graded += material[:,:,None]*edible_area[:,:,None]*.43
    graded_img = Image.fromarray(np.uint8(np.clip(np.rint(graded),0,255)),'RGB')
    softened = graded_img.filter(ImageFilter.GaussianBlur(max(.5,min(w,h)*.0007)))
    photo = np.asarray(softened,dtype=np.float32)
    # The top fade is local to the corners so the navigation can sit over the
    # macro fruit or bacon. Avoid diluting the saturated central color field.
    edge = np.clip((np.abs(xx-.5)-.30)/.20,0,1)
    header = np.exp(-np.square(yy/.13)) * (.25+.75*edge)
    tint = .13 + np.clip(departure/185,0,1)*.13 + header*.41
    light = tone[None,None,:] + header[:,:,None]*.15*(255-tone[None,None,:])
    color = photo*(1-tint[:,:,None]) + light*tint[:,:,None]
    return Image.fromarray(np.uint8(np.clip(np.rint(color),0,255)),'RGB')


def run(originals,archive_path):
    destination = PUBLIC / 'backgrounds'
    destination.mkdir(parents=True,exist_ok=True)
    archive = None
    if archive_path:
        archive_path.parent.mkdir(parents=True,exist_ok=True)
        archive = zipfile.ZipFile(archive_path,'w',compression=zipfile.ZIP_STORED)
    records = []
    try:
        for slug, (tone,ingredient) in SCENES.items():
            for layout,(web_size,master_size,orientation) in SIZES.items():
                key = f'{slug}-{layout}'
                with Image.open(originals/(key+'.png')) as source:
                    native_size = source.size
                    photo = grade(source,slug)
                if archive is None:
                    web = ImageOps.fit(photo,web_size,Image.Resampling.LANCZOS)
                    path = destination/(key+'.webp')
                    web.save(path,format='WEBP',quality=84,method=6)
                    print(f'{path.name} {web.width}x{web.height} {path.stat().st_size}',flush=True)
                    continue
                master = ImageOps.fit(photo,master_size,Image.Resampling.LANCZOS)
                output_name = f'{orientation}/{slug}-{master.width}x{master.height}.png'
                buffered = io.BytesIO()
                master.save(buffered,format='PNG',compress_level=6)
                archive.writestr(output_name,buffered.getvalue())
                records.append({'archivo':output_name,'escena':slug,'composicion':orientation,'colorBase':tone,
                                'texturaDelIngrediente':ingredient,'resolucionDeOrigen':list(native_size),
                                'resolucionExportada':list(master_size)})
                print(output_name,flush=True)
        if archive:
            data = {'marca':'Purple', 'metodo':'Composiciones originales de ImageGen en horizontal y vertical. El etalonaje usa el color de cada escena y textura del ingrediente del visor. Los PNG se ampliaron mediante interpolación Lanczos.',
                    'imagenes':records}
            archive.writestr('procedencia.json',json.dumps(data,indent=2,ensure_ascii=False)+'\n')
    finally:
        if archive:
            archive.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('originals',type=Path)
    parser.add_argument('--archive',type=Path,help='Build the 4K PNG archive instead of the responsive WebP files.')
    args = parser.parse_args()
    run(args.originals,args.archive)
