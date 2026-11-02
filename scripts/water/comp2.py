import numpy as np, cv2, sys, os
from sim import frame, OUT
W,H=1280,512
# ---- the wall, seen at a raking angle: a plane receding to a horizon above
# the frame, so the light lines converge, shrink and soften with distance.
yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
u=(xx-W*.62)/W; vv=yy/H
hz=-0.55                         # horizon above the top edge
z=1.0/(vv-hz)                    # depth along the wall
z0=z.max(); zn=(z-z.min())/(z.max()-z.min())   # 0 near (bottom) .. 1 far (top)
X=u*z*1.15; Y=z*0.9
ang=np.deg2rad(34)
TX=(X*np.cos(ang)-Y*np.sin(ang))*OUT*.85
TY=(X*np.sin(ang)+Y*np.cos(ang))*OUT*.85
mapx=(TX%OUT).astype(np.float32); mapy=(TY%OUT).astype(np.float32)
# plaster relief from the photograph, mapped onto the same plane
pl=cv2.imread('/home/claude/qa/imgsrc/p2.jpg',0).astype(np.float32)/255
pl=cv2.resize(pl,(OUT,OUT//2)); pl=np.vstack([pl,pl[::-1]]); pl=np.hstack([pl,pl[:,::-1]]); pl=cv2.resize(pl,(OUT,OUT))
detail=pl-cv2.GaussianBlur(pl,(0,0),12); detail/=detail.std()+1e-6
relief=cv2.remap(detail,mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_WRAP)
relief=cv2.GaussianBlur(relief,(0,0),.7)*(1-zn*.7)
def sample(tex,blur_levels=(0.7,1.6,3.2)):
    outs=[cv2.remap(cv2.GaussianBlur(tex,(0,0),s),mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_WRAP) for s in blur_levels]
    a=np.clip(zn*2,0,1); b=np.clip(zn*2-1,0,1)
    return outs[0]*(1-a)+outs[1]*(a-b)+outs[2]*b
sun=np.exp(-(((xx-W*.84)/(W*.6))**2+((yy-H*.02)/(H*1.2))**2))
reach=np.clip(.30+.70*np.clip(xx/(W*.6),0,1),0,1)
fog=1-zn*.45
def render(t,ref):
    chans=[]
    for ds in (1.035,1.0,0.965):           # slight dispersion: warm and cool edges
        chans.append(sample(frame(t,ds).astype(np.float32))/ref)
    c=np.stack(chans,-1)                    # r,g,b order
    lum=c.mean(-1)
    bloom=cv2.GaussianBlur(lum,(0,0),10); soft=cv2.GaussianBlur(lum,(0,0),45)
    wall0=np.array([.030,.052,.042]); wall1=np.array([.095,.140,.115])
    g=np.clip((xx/W)*.75+(1-yy/H)*.35,0,1)[...,None]
    albedo=(wall0+(wall1-wall0)*g)*(1+relief[...,None]*.10)
    light=np.array([.66,.82,.68])*(1-sun[...,None]*.55)+np.array([.97,.93,.78])*(sun[...,None]*.55)
    k=((sun*.85+.16)*reach*fog)[...,None]
    shade=(1+relief[...,None]*.22)             # the plaster catches the light
    lightmap=(np.clip(c,0,3)**1.25*1.25+bloom[...,None]*.55+soft[...,None]*.4)*shade
    col=albedo*(.85+.4*sun[...,None]) + light*lightmap*k
    col=1-np.exp(-col*1.3)
    col*= (1-.25*np.clip((xx/W-.0)*-1+.25,0,1))[...,None]
    return (np.clip(col,0,1)[...,::-1]*255).astype(np.uint8)
if __name__=='__main__':
    T=6.0; SLOW=float(os.environ.get('SLOW','.3')); FPS=24; n=int(round(T/SLOW*FPS))
    a,b=int(sys.argv[1]),int(sys.argv[2])
    ref=np.percentile(frame(0.),99.5)
    os.makedirs('frames2',exist_ok=True)
    for i in range(a,min(b,n)):
        if os.path.exists('frames2/f%04d.png'%i): continue
        cv2.imwrite('frames2/f%04d.png'%i,render(i/FPS*SLOW,ref))
    print('done',a,b,n)
