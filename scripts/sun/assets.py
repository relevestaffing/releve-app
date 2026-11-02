import cv2, numpy as np
from PIL import Image
S=2.4; H,W=1200,2400
P0=np.load('P0c.npy'); m2=np.load('mask_soft.npy'); Lf=np.load('leaf.npy'); env=np.load('env.npy')
# texture only: divide out smooth ambient, keep plaster grain and mottle
lum=P0.mean(2)
sm=cv2.GaussianBlur(lum,(0,0),120*S)
t=lum/np.maximum(sm,1e-6)          # ~1 mean
lt=np.log(t); lt=lt/lt.std()*0.16   # normalised mottle+grain
tex=np.clip(0.5+lt*0.9,0,1)        # store log-ish: value v -> exp((v-0.5)/0.9)
Image.fromarray((cv2.resize(tex,(2000,1000),interpolation=cv2.INTER_AREA)*255).astype(np.uint8),'L').save('plaster.webp',quality=82)
light=env*m2
bounce=cv2.GaussianBlur(light,(0,0),80*S); bounce/=bounce.max()
R=np.clip(light/2.2,0,1); G=np.clip(Lf,0,1); B=np.clip(bounce,0,1)
rgb=(np.dstack([R,G,B])*255+0.5).astype(np.uint8)
rgb=cv2.resize(rgb,(1600,800),interpolation=cv2.INTER_AREA)
Image.fromarray(rgb,'RGB').save('sunlight.webp',lossless=True,quality=100)
import os; print(os.path.getsize('plaster.webp'),os.path.getsize('sunlight.webp'))
