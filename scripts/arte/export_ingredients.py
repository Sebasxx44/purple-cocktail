"""Build separate, alpha-masked ingredient surfaces and the storefront manifest.

Use the same isolated source PNG directory as export_products.py. Flat items
preserve holes and folds. Rounded elements use their local silhouette distance
to reconstruct a limited-angle surface. Camera limits are recorded per item.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from export_products import DRINKS, GLB, OUT, SLUGS, isolated, profile_model, scaled, vertex_normals


# Canonical catalog ingredient, caption for its close-up, illustrative asset.
COMPOSITION = {
    'arandanos-perlas': [
        ('Arándanos', 'La fruta que corona el vaso junto a las perlas rojas.', 'arandanos'),
        ('Perlas', 'Esferas brillantes sobre la capa superior del granizado.', 'perlas'),
        ('Granizado con licor a elección', 'Elige entre las cinco bases de granizado con licor de Purple.', 'hielo'),
    ],
    'purple-crispy': [
        ('Doble carne smash', 'Dos carnes a la plancha, con bordes dorados.', 'carne-smash'),
        ('Queso americano', 'Queso fundido sobre las carnes smash.', 'queso-americano'),
        ('Tocineta', 'Tiras de tocineta que sobresalen del pan.', 'tocineta'),
        ('Cebolla crispy', 'Hebras doradas de cebolla crujiente.', 'cebolla-crispy'),
        ('Salsa smash', 'La salsa que acompaña la cebolla y la tocineta.', 'salsa-smash'),
    ],
    'fresa-vodka': [
        ('Fresa', 'El sabor que da nombre a este granizado rojo.', 'fresa'),
        ('Vodka', 'El destilado que acompaña el sabor a fresa.', 'destilado'),
    ],
    'jack-bacon': [
        ('Pan brioche', 'Pan dorado que envuelve las dos carnes.', 'brioche'),
        ('Doble carne smash', 'Dos carnes selladas a la plancha.', 'carne-smash'),
        ('Queso mozzarella', 'Mozzarella fundida entre las capas de carne.', 'mozzarella'),
        ('Tocineta en reducción de whisky', 'Trozos de tocineta bañados en la reducción.', 'tocineta-whisky'),
        ('Queso crema', 'La capa cremosa debajo del pan superior.', 'queso-crema'),
        ('Salsa de la casa', 'La salsa de Purple que completa la Jack Bacon.', 'salsa-casa'),
    ],
    'margarita-tequila': [
        ('Granizado de margarita', 'Base helada de color verde intenso.', 'margarita'),
        ('Tequila', 'El destilado de la margarita de Purple.', 'destilado'),
    ],
    'atlantica': [
        ('Doble carne smash', 'Dos carnes con bordes tostados.', 'carne-smash'),
        ('Doble queso americano', 'Dos capas de queso americano fundido.', 'queso-americano'),
        ('Salsa de tocineta', 'La salsa con trozos de tocineta de la Atlántica.', 'salsa-tocineta'),
        ('Pepinillos', 'Rodajas de pepinillo que acompañan las carnes y el queso.', 'pepinillos'),
    ],
}
TITLES = ['Arándanos y perlas','Purple Crispy','Fresa vodka','Jack Bacon','Margarita tequila','Atlántica']
PROFILES = {
    # Relative roundness, directional fold, swatch.
    'arandanos': (1.0,0.,'#536680'), 'perlas': (.81,0.,'#b62135'), 'hielo': (.77,.19,'#9dcbd8'),
    'fresa': (.92,.02,'#cd323b'), 'destilado': (.70,0.,'#bac2c7'), 'margarita': (.68,.07,'#9bc72d'),
    'carne-smash': (.50,.22,'#79472b'), 'queso-americano': (.19,.19,'#f5b623'),
    'tocineta': (.20,.25,'#a33e28'), 'cebolla-crispy': (.44,.14,'#cc8c37'), 'salsa-smash': (.72,.02,'#723323'),
    'brioche': (.76,.13,'#bb732b'), 'mozzarella': (.22,.18,'#ede1b7'), 'tocineta-whisky': (.72,.03,'#9d502e'),
    'queso-crema': (.75,.07,'#f2e8ce'), 'salsa-casa': (.68,.04,'#e6a064'),
    'salsa-tocineta': (.64,.08,'#913e25'), 'pepinillos': (.34,.20,'#8a9f3b'),
}
SHORT = {'Granizado con licor a elección':'Base granizada', 'Doble carne smash':'Carne smash',
         'Tocineta en reducción de whisky':'Tocineta al whisky','Doble queso americano':'Queso americano',
         'Granizado de margarita':'Margarita'}


def border_distances(mask):
    values=np.where(mask,1e5,0.).astype(np.float32)
    h,w=mask.shape
    for y in range(1,h-1):
        for x in range(1,w-1):
            if mask[y,x]:
                values[y,x]=min(values[y,x],values[y-1,x]+1,values[y,x-1]+1,
                                values[y-1,x-1]+1.4142,values[y-1,x+1]+1.4142)
    for y in range(h-2,0,-1):
        for x in range(w-2,0,-1):
            if mask[y,x]:
                values[y,x]=min(values[y,x],values[y+1,x]+1,values[y,x+1]+1,
                                values[y+1,x+1]+1.4142,values[y+1,x-1]+1.4142)
    return values


def relief_model(image,slug,dst):
    texture=image.copy(); texture.thumbnail((620,620),Image.Resampling.LANCZOS)
    grid=scaled(image,104); w,h=grid.size
    alpha=grid.getchannel('A'); solid=np.asarray(alpha)>110
    solid[[0,-1],:]=False; solid[:,[0,-1]]=False
    coverage=np.asarray(alpha.filter(ImageFilter.MaxFilter(3)))>20
    distances=border_distances(solid); max_dist=max(1.,float(distances.max()))
    depth,fold,_=PROFILES[slug]
    y,x=np.indices((h,w)); unit=max(w,h)/2
    x_world=(x-(w-1)/2)/unit; y_world=((h-1)/2-y)/unit
    thickness=np.sqrt(np.maximum(0,distances*(2*max_dist-distances)))/unit*depth
    bend=fold*(.6*np.sin(2.2*x_world+.7*y_world)+.4*y_world)
    front=np.stack((x_world,y_world,thickness+bend),axis=-1)
    back=np.stack((x_world,y_world,bend-thickness*.92),axis=-1)
    yy,xx=np.where(coverage); count=len(xx); keys=np.full((h,w),-1,dtype=int); keys[yy,xx]=np.arange(count)
    positions=np.concatenate((front[yy,xx],back[yy,xx]),axis=0)
    tex=np.stack(((xx+.5)/w,(yy+.5)/h),axis=1); tex=np.concatenate((tex,tex),axis=0)
    triangles=[]
    for j in range(h-1):
        for i in range(w-1):
            a,b,c,d=keys[j,i],keys[j,i+1],keys[j+1,i],keys[j+1,i+1]
            if min(a,c,b)>=0: triangles.append((a,c,b))
            if min(c,d,b)>=0: triangles.append((c,d,b))
    front_idx=np.array(triangles); rear_idx=front_idx[:,::-1]+count
    # Connect boundary edges in pairs, including negative space between food pieces.
    edges={}
    for face in triangles:
        for a,b in ((face[0],face[1]),(face[1],face[2]),(face[2],face[0])):
            edge=(min(a,b),max(a,b))
            if edge in edges: del edges[edge]
            else: edges[edge]=(a,b)
    shell=[]
    for a,b in edges.values(): shell.extend(((a,b+count,b),(a,a+count,b+count)))
    indices=np.concatenate((front_idx,rear_idx,np.asarray(shell,dtype=int).reshape(-1,3)))
    normals=vertex_normals(positions,indices)
    glb=GLB(); material=glb.material('Textura de la pieza',texture=texture)
    glb.mesh(slug,[glb.primitive(positions,normals,indices,material,uv=tex)]); glb.write(dst)


def manifest():
    info=json.loads((OUT/'products'/'art.json').read_text(encoding='utf8'))
    catalog=json.loads((OUT.parent/'catalog'/'catalog.json').read_text(encoding='utf8'))
    by_slug={item['slug']:item for item in catalog['products']}; result=[]
    for slug,title in zip(SLUGS,TITLES):
        product=by_slug[slug]; pieces=[]
        for name,caption,asset in COMPOSITION[slug]:
            prefix='/showcase/ingredients/'+asset
            pieces.append({'name':name, 'shortName':SHORT.get(name,name), 'description':caption,
                           'mesh':asset,'color':PROFILES[asset][2],'image':prefix+'.webp','model':prefix+'.glb',
                           'master':'/showcase/ingredients/4k/'+asset+'.webp',
                           'maxYaw':20,'maxPitch':9})
        assert product['ingredients']==[item['name'] for item in pieces],slug
        result.append({'id':product['id'], 'slug':slug, 'name':title, 'displayName':title,
                       'kind':'drink' if slug in DRINKS else 'burger',
                       'image':'/showcase/products/'+slug+'.webp','imageSmall':'/showcase/products/'+slug+'-sm.webp',
                       'model':'/showcase/products/'+slug+'.glb','master':'/showcase/masters/'+slug+'.png',
                       'maxYaw':16,'maxPitch':6,'ingredients':pieces,'referenceSize':product['imageSizeOriginal'], **info[slug]})
    (OUT/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


def run(source, assets, masters_only=False):
    destination=OUT/'ingredients'; destination.mkdir(parents=True,exist_ok=True)
    masters=destination/'4k'; masters.mkdir(exist_ok=True)
    for slug in assets:
        with Image.open(source/(slug+'.png')) as raw: image=isolated(raw)
        scaled(image,3840).save(masters/(slug+'.webp'),format='WEBP',quality=87,method=4)
        if masters_only: continue
        photo=scaled(image,470)
        photo.save(destination/(slug+'.webp'),format='WEBP',quality=89,method=5)
        if slug=='destilado': profile_model(image,slug,destination/(slug+'.glb'))
        else: relief_model(image,slug,destination/(slug+'.glb'))
        print(slug,flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path); parser.add_argument('slugs',nargs='*'); parser.add_argument('--manifest-only',action='store_true')
    parser.add_argument('--masters-only',action='store_true')
    options=parser.parse_args()
    manifest()
    if not options.manifest_only: run(options.source,options.slugs or list(PROFILES),options.masters_only)
