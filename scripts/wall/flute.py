import numpy as np, cv2, sys, os, json
# A fluted limewash wall in Relève green, lit by the sun through a window,
# rendered physically: heightfield relief (concave flutes + real plaster
# grain from a photograph), soft ray-marched shadows, ambient occlusion,
# sky and floor bounce, then seen in perspective with a lens.
WT,HT=2600,1040
P=78.0; ARRIS=6.0; D=0.30*P
xx=np.arange(WT,dtype=np.float32)[None,:].repeat(HT,0); yy=np.arange(HT,dtype=np.float32)[:,None].repeat(WT,1)
u=np.mod(xx,P); half=(P-ARRIS)/2; c=ARRIS/2+half
t=np.clip((u-c)/half,-1,1)
inch=(np.abs(u-c)<half)
h=np.where(inch,D*np.sqrt(np.clip(1-t*t,0,1))**0.85,0.0).astype(np.float32)   # convex reeds, small grooves between
h=cv2.GaussianBlur(h,(0,0),1.3)                      # softened arrises
# real plaster: trowel mottling + fine grain from the limewash photograph
ph=cv2.imread('/home/claude/qa/imgsrc/p4.jpg',0).astype(np.float32)/255
ph=cv2.resize(ph,(1300,1040)); ph=np.hstack([ph,ph[:,::-1]])
fine=ph-cv2.GaussianBlur(ph,(0,0),3); fine/=fine.std()
mid=cv2.GaussianBlur(ph,(0,0),3)-cv2.GaussianBlur(ph,(0,0),40); mid/=mid.std()
h=h+fine*0.07+mid*0.5
mott=cv2.GaussianBlur(ph,(0,0),25); mott=(mott-mott.mean())/mott.std()
gy,gx=np.gradient(h)
n=np.stack([-gx,-gy,np.ones_like(h)],-1); n/=np.linalg.norm(n,axis=-1,keepdims=True)
# ambient occlusion: how far below its surroundings each point sits
ao=np.clip(1+(h-cv2.GaussianBlur(h,(0,0),12))/ (D*0.9),0.25,1.0)**1.3
def shadow(L,soft=10.0,steps=48,ds=3.0):
    lx,ly,lz=L; hl=np.hypot(lx,ly)+1e-6; dx,dy=lx/hl,ly/hl; tanE=lz/hl
    res=np.ones_like(h)
    for s in range(1,steps+1):
        d=s*ds
        mx=(xx+dx*d)%WT; my=np.clip(yy+dy*d,0,HT-1)
        hs=cv2.remap(h,mx.astype(np.float32),my.astype(np.float32),cv2.INTER_LINEAR)
        ray=h+d*tanE
        res=np.minimum(res,np.clip(soft*(ray-hs)/d+0.5,0,1))
    return res**1.5
def soft_rect(x0,x1,y0,y1,f):
    sx=np.clip((xx-x0)/f+.5,0,1)*np.clip((x1-xx)/f+.5,0,1)
    sy=np.clip((yy-y0)/f+.5,0,1)*np.clip((y1-yy)/f+.5,0,1)
    return sx*sy
def window_patch(cx,cy,w,hgt,skew,feather):
    # a tall two-light window with a mullion and transom, projected and skewed
    m=np.zeros_like(h)
    yy2=yy-cy; xs=xx-cx-skew*yy2
    for (a,b) in ((-w/2,-6),(6,w/2)):
        for (c0,c1) in ((-hgt/2,-hgt*0.12),(-hgt*0.12+10,hgt/2)):
            sx=np.clip((xs-a)/feather+.5,0,1)*np.clip((b-xs)/feather+.5,0,1)
            sy=np.clip((yy2-c0)/feather+.5,0,1)*np.clip((c1-yy2)/feather+.5,0,1)
            m=np.maximum(m,sx*sy)
    return m
def srgb_to_lin(c): c=np.asarray(c,np.float32)/255; return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
def lin_to_srgb(c): c=np.clip(c,0,1); return np.where(c<=.0031308,c*12.92,1.055*c**(1/2.4)-.055)
ALB=srgb_to_lin([88,122,104])
def render(k):
    L=np.array(k['L'],np.float32); L/=np.linalg.norm(L)
    sun=srgb_to_lin(k['sun'])*k['sunI']; sky=srgb_to_lin(k['sky'])*k['skyI']
    albedo=ALB[None,None,:]*(1+mott[...,None]*0.06)
    ndl=np.clip((n*L).sum(-1),0,1)
    out=np.zeros(h.shape+(3,),np.float32)
    if k['sunI']>0:
        sh=shadow(L,soft=k.get('soft',9.0))
        patch=window_patch(*k['patch'])
        out+=sun*(ndl*sh*patch)[...,None]
        # sun striking the floor bounces warm light up the wall
        bounce=np.clip(yy/HT,0,1)**2
        out+=sun*0.10*(bounce*ao)[...,None]
    sky_n=np.clip(n[...,2]*.45+(-n[...,1])*.15+n[...,0]*float(k.get('skyX',-0.35))+.22,0,1)**1.4
    out+=sky*(sky_n*ao)[...,None]
    if k.get('lamp',0)>0:
        # wall washers in the floor: light grazing up the flutes
        lampL=np.array([0.0,0.97,0.25]); lampL/=np.linalg.norm(lampL)
        ndl2=np.clip((n*lampL).sum(-1),0,1)
        cols=np.exp(-((np.mod(xx,560)-280)/120)**2)*(0.15+np.clip((yy/HT),0,1)**2.2)
        out+=srgb_to_lin(k['lampC'])*k['lamp']*(ndl2*cols*ao)[...,None]
    return out*albedo
WO,HO=1920,740
src=np.float32([[0,0],[WT,0],[WT,HT],[0,HT]])
dst=np.float32([[-80,-60],[WO+40,10],[WO+40,HO-10],[-80,HO+60]])  # wall turns away to the left
M=cv2.getPerspectiveTransform(src,dst)
yo,xo=np.mgrid[0:HO,0:WO].astype(np.float32)
rng=np.random.default_rng(3)
def finish(lin,expo):
    img=cv2.warpPerspective(lin,M,(WO,HO),flags=cv2.INTER_AREA,borderMode=cv2.BORDER_REFLECT)
    far=np.clip(1-xo/WO*2.2,0,1)[...,None]                 # far end slightly soft
    img=img*(1-far)+cv2.GaussianBlur(img,(0,0),2.2)*far
    img=img*expo
    img=img/(1+img*0.35)                                    # soft highlight shoulder
    vig=(1-0.35*((xo/WO-.6)**2+(yo/HO-.45)**2*1.6))[...,None]
    img=lin_to_srgb(img*vig)
    img=img+rng.normal(0,0.008,img.shape).astype(np.float32)
    return (np.clip(img,0,1)[...,::-1]*255).astype(np.uint8)
KEYS=json.load(open('keys.json'))
if __name__=='__main__':
    names=sys.argv[1:] or list(KEYS)
    for nm in names:
        k=KEYS[nm]; cv2.imwrite(f'out/{nm}.png',finish(render(k),k['expo']))
        if k['sunI']>0.5:   # the same moment with a cloud over the sun
            k2=dict(k); k2['sunI']=k['sunI']*0.18; k2['skyI']=k['skyI']*1.15
            cv2.imwrite(f'out/{nm}-cloud.png',finish(render(k2),k['expo']))
        print('ok',nm)
