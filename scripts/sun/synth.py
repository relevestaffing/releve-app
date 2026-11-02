import cv2, numpy as np
S=2.4; W,H=2400,1200
yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
X=xx/S; Y=yy/S   # 1000-scale coords
def below(x0,y0,m): return Y > y0 + m*(X-x0)
def band(x0,y0,m,th):   # distance to line (vertical) within th/2
    return np.abs(Y-(y0+m*(X-x0))) < th/2
inside = (X>462)&(X<997)& below(470,190,-0.404) & ~below(760,487,-0.595)
mull = ((X>630)&(X<667)) | ((X>886)&(X<911))
th=26-(X-470)*0.023
bars = band(470,373,-0.504,th) | band(760,398,-0.62,th*0.95)
mask=(inside&~mull&~bars).astype(np.float32)
np.save('mask_hard.npy',mask)
M=np.load('M.npy')
m2=cv2.GaussianBlur(mask,(0,0),3*S)
# envelope of sun brightness inside panes (exclude leaves by using median-ish robust blur)
core=cv2.erode(mask,np.ones((25,25),np.uint8))
leaves=np.load('leaves.npy').astype(np.float32)
w=core*(1-cv2.dilate(leaves,np.ones((15,15),np.uint8)))
num=cv2.GaussianBlur(M*w,(0,0),30*S); den=cv2.GaussianBlur(w,(0,0),30*S)
env=num/np.maximum(den,1e-3)
env=np.where(den>1e-3,env,0)
np.save('env.npy',env.astype(np.float32)); np.save('mask_soft.npy',m2.astype(np.float32))
# compare
vis=np.dstack([np.clip(M/2,0,1)*255, np.clip(m2*env/2,0,1)*255, np.clip(M/2,0,1)*255]).astype(np.uint8)
cv2.imwrite('dbg-fit.png',cv2.resize(vis,(1000,500)))
cv2.imwrite('dbg-fit-crop.png',vis[200:800,1400:2400])
print('env range', env[mask>0].min(), env[mask>0].max())

# leaf shadow layer
Mm=cv2.GaussianBlur(M,(0,0),0.8)
ratio=Mm/np.maximum(env*m2,1e-3)
L=np.clip(1-ratio,0,1)
zone=cv2.dilate(leaves,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(61,61)))*(m2>0.6)*(X>680)
def ss(a,b,x): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
Lf=ss(0.10,0.45,L)*zone
Lf=cv2.GaussianBlur(Lf,(0,0),1.0)
np.save('leaf.npy',Lf.astype(np.float32))
cv2.imwrite('dbg-leaf.png',cv2.resize((Lf*255).astype(np.uint8),(1000,500)))
