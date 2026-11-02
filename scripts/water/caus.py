import numpy as np, cv2, sys, os
# Light thrown by rippling water onto a wall, as in Nona's references: we
# never see the water, only its light and shadow. A wind-driven water
# surface (ocean spectrum + fine ripples) refracts sunlight; every ray is
# traced down to the receiving surface and splatted (photon mapping), the
# sun's finite size softens the cusps, and the pattern lands on a plaster
# wall seen in steep perspective. Graded like a photograph: the wall's
# deep green body colour, light that saturates to warm cream, bloom.
N=1536; OUT=1024; L=3.2; T=7.0
rng=np.random.default_rng(5)
k=np.fft.fftfreq(N,L/N)*2*np.pi
KX,KY=np.meshgrid(k,k); K=np.sqrt(KX**2+KY**2); K[0,0]=1e-6
g=9.81; wd=np.array([np.cos(1.1),np.sin(1.1)])
cosw=np.abs((KX*wd[0]+KY*wd[1])/K)
Lw=1.6**2/g
ph=np.exp(-1/(K*Lw)**2)/K**4*cosw**14*np.exp(-(K*0.03)**2)      # long swell bands
ph+=0.12*np.exp(-1/(K*0.06)**2)/K**4*cosw**4*np.exp(-(K*0.02)**2) # fine ripples
ph[0,0]=0
h0=(rng.normal(size=(N,N))+1j*rng.normal(size=(N,N)))*np.sqrt(ph/2)
w0=2*np.pi/T
omega=np.maximum(1,np.round(np.sqrt(g*K)/w0))*w0
h0m=np.conj(np.roll(np.flip(h0,(0,1)),1,(0,1)))
def blurw(img,s):
    p=int(s*4)+2; q=np.pad(img,p,mode='wrap'); return cv2.GaussianBlur(q,(0,0),s)[p:-p,p:-p]
xs=np.arange(N,dtype=np.float32)[None,:]+np.zeros((N,1),np.float32); ys=xs.T.copy()
def caustic(t,depth=2.0):
    e=np.exp(1j*omega*t); hk=h0*e+h0m*np.conj(e)
    gx=np.real(np.fft.ifft2(1j*KX*hk)); gy=np.real(np.fft.ifft2(1j*KY*hk))
    s=0.11/np.sqrt((gx**2+gy**2).mean()); gx*=s; gy*=s
    off=depth*(1-1/1.33)*N/L
    px=((xs-gx*off)%N)*OUT/N; py=((ys-gy*off)%N)*OUT/N
    img,_,_=np.histogram2d(py.ravel(),px.ravel(),bins=OUT,range=[[0,OUT],[0,OUT]])
    img=img.astype(np.float32)/(N*N/(OUT*OUT))
    return blurw(img,1.4)          # sun's angular size
W,H=1280,512
yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
# wall plane in perspective: horizon above the band, receding up and to the left
u=(xx-W*.70)/W; vv=yy/H; hz=-0.42
z=1.0/(vv-hz); zn=(z-z.min())/(z.max()-z.min())
X=-u*z*1.05+0.25*z; Y=z*0.95
ang=np.deg2rad(-58)
S=OUT*0.62
mapx=((X*np.cos(ang)-Y*np.sin(ang))*S%OUT).astype(np.float32)
mapy=((X*np.sin(ang)+Y*np.cos(ang))*S%OUT).astype(np.float32)
pl=cv2.imread('/home/claude/qa/imgsrc/p4.jpg',0).astype(np.float32)/255
pl=cv2.resize(pl,(OUT//2,OUT//2)); pl=np.vstack([np.hstack([pl,pl[:,::-1]]),np.hstack([pl[::-1],pl[::-1,::-1]])])
pl=(pl-blurw(pl,20)); pl/=pl.std()+1e-6
relief=cv2.remap(pl,mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_WRAP)*(1-zn*.8)
def sample(img):
    a=cv2.remap(img,mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_WRAP)
    b=cv2.remap(blurw(img,2.2),mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_WRAP)
    c=cv2.remap(blurw(img,5.0),mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_WRAP)
    w1=np.clip(zn*2,0,1); w2=np.clip(zn*2-1,0,1)
    return a*(1-w1)+b*(w1-w2)+c*w2
# light falls from upper right, fading toward the left where the title sits
sunpatch=np.exp(-(((xx-W*.80)/(W*.55))**2+((yy-H*.10)/(H*1.1))**2))
leftfade=np.clip(.22+.78*np.clip((xx-W*.05)/(W*.62),0,1),0,1)
albedo=np.array([.20,.40,.28],np.float32)        # Relève fern plaster (linear)
lightcol=np.array([1.0,.90,.70],np.float32)       # late sun, warm
def render(t):
    c=sample(caustic(t))
    c=c*(1+relief*.10)
    irr=(c*1.25+0.02)*(sunpatch*1.0+.10)*leftfade*(1-zn*.35)
    rad=albedo[None,None,:]*lightcol[None,None,:]*irr[...,None]
    rad*= (1+relief[...,None]*.05)
    bloom=cv2.GaussianBlur(rad,(0,0),6)*.45+cv2.GaussianBlur(rad,(0,0),26)*.35
    col=rad+bloom
    exp_=1.25
    col=1-np.exp(-col*exp_)                          # per-channel filmic shoulder
    col=col**(1/1.55)                                  # to display gamma
    col=col*(1-.18*np.clip(1-(xx/W)*2.2,0,1))[...,None]
    return (np.clip(col,0,1)[...,::-1]*255).astype(np.uint8)
if __name__=='__main__':
    SLOW=float(os.environ.get('SLOW','.26')); FPS=24; n=int(round(T/SLOW*FPS))
    if sys.argv[1]=='test': cv2.imwrite('test.png',render(float(sys.argv[2]))); sys.exit()
    a,b=int(sys.argv[1]),int(sys.argv[2]); os.makedirs('frames',exist_ok=True)
    for i in range(a,min(b,n)):
        p='frames/f%04d.png'%i
        if not os.path.exists(p): cv2.imwrite(p,render(i/FPS*SLOW))
    print('done',a,b,n)
