import cv2, numpy as np
src = cv2.imread('../opts/C.jpg').astype(np.float32)/255.0   # BGR, 2400x1200
lin = src**2.2
H,W = lin.shape[:2]
L = lin.mean(axis=2)+1e-4
logL = np.log(L)
# edge-preserving illumination estimate: guided filter on log luminance
I = cv2.ximgproc.guidedFilter(logL.astype(np.float32), logL.astype(np.float32), 10, 0.04)
I = cv2.ximgproc.guidedFilter(I, I, 6, 0.02)
illum = np.exp(I)
# ambient: smooth lower envelope
small = cv2.resize(illum,(W//8,H//8),interpolation=cv2.INTER_AREA)
amb = cv2.erode(small, np.ones((25,25),np.uint8))
amb = cv2.GaussianBlur(amb,(0,0),12)
amb = cv2.resize(amb,(W,H),interpolation=cv2.INTER_CUBIC)
amb = np.minimum(amb, illum)
sun = np.maximum(illum-amb,0)
ref = np.percentile(sun[sun>np.percentile(sun,80)],60)
M = sun/ref
print('amb range',amb.min(),amb.max(),'ref',ref,'M p99',np.percentile(M,99.5))
np.save('M.npy',M.astype(np.float32)); np.save('amb.npy',amb.astype(np.float32)); np.save('illum.npy',illum.astype(np.float32))
cv2.imwrite('M.png',np.clip(M/2*255,0,255).astype(np.uint8))
cv2.imwrite('amb.png',np.clip(amb/amb.max()*255,0,255).astype(np.uint8))
