"""Recover the handwritten print from Purple's original cup photographs.

The catalog reference and the studio reconstruction have different lighting
and dimensions. Warp the original printed area into the studio frame, match
the surrounding color, and feather its ink over the isolated cup. This keeps
the logo's small lettering faithful to the photographed packaging.
"""

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


# Rotation into horizontal reading direction, source print, target print, and
# the dominant slush channel. Coordinates describe the shipped studio inputs.
PRINT = {
    'arandanos-perlas': (-90, (437,353,564,400), (788,570,1073,682), 2),
    'fresa-vodka': (90, (713,430,887,474), (969,641,1296,719), 0),
    'margarita-tequila': (90, (713,430,887,474), (987,649,1328,736), 1),
}


def slush_background(rgb, size):
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size,size))
    color = cv2.morphologyEx(rgb, cv2.MORPH_CLOSE, kernel)
    return cv2.GaussianBlur(color, (0,0), 2.2).astype(float)


def restore(slug, original_dir, studio_dir, destination):
    rotation, source_box, target_box, channel = PRINT[slug]
    source = Image.open(original_dir/(slug+'.jpg')).convert('RGB').rotate(rotation,expand=True)
    target = Image.open(studio_dir/(slug+'.png')).convert('RGBA').rotate(rotation,expand=True)
    original = np.asarray(source.crop(source_box)); x,y,right,bottom=target_box
    w,h=right-x,bottom-y; pad=15
    area=(x-pad,y-pad,right+pad,bottom+pad)
    studio=np.array(target.crop(area).convert('RGB')); central=studio[pad:pad+h,pad:pad+w]
    ink_free=slush_background(original,15)
    source_color=cv2.resize(ink_free,(w,h),interpolation=cv2.INTER_LINEAR)
    studio_color=slush_background(central,35)
    warped=cv2.resize(original,(w,h),interpolation=cv2.INTER_LANCZOS4).astype(float)
    gain=np.clip((studio_color+15)/(source_color+15),.52,2.4)
    recovered=np.clip(warped*gain,0,255)

    peak=studio.max(2).astype(float)
    if slug=='arandanos-perlas':
        local=cv2.dilate(peak, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(15,15)))
        ink_mask=((local-peak)>.28*local) & (peak<65)
        cutoff=38
    else:
        ink_mask=studio[:,:,channel]<125
        cutoff=143
    mask=cv2.dilate(ink_mask.astype('uint8')*255,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
    mask[:pad]=0; mask[-pad:]=0; mask[:,:pad]=0; mask[:,-pad:]=0
    clean=cv2.inpaint(studio,mask,5,cv2.INPAINT_TELEA)
    support=(original.max(2)<cutoff).astype('uint8')*255
    support=cv2.dilate(support,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
    support=cv2.resize(support,(w,h),interpolation=cv2.INTER_CUBIC)
    support=cv2.GaussianBlur(support,(0,0),1.5).astype(float)/255
    yy,xx=np.indices((h,w));edge=np.minimum.reduce((xx,w-1-xx,yy,h-1-yy))
    weight=(support*np.clip(edge/4,0,1))[:,:,None]
    patch=clean[pad:pad+h,pad:pad+w].astype(float)*(1-weight)+recovered*weight
    clean[pad:pad+h,pad:pad+w]=np.uint8(np.clip(patch,0,255))
    target.paste(Image.fromarray(clean),area[:2]);destination.mkdir(parents=True,exist_ok=True)
    target.rotate(-rotation,expand=True).save(destination/(slug+'.png'),compress_level=4)


if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('originals',type=Path); cli.add_argument('studio',type=Path); cli.add_argument('destination',type=Path)
    args=cli.parse_args()
    for product in PRINT: restore(product,args.originals,args.studio,args.destination)
