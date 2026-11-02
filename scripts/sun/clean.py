import cv2, numpy as np
M=np.load('M.npy'); amb=np.load('amb.npy')
H,W=M.shape
Ms=cv2.GaussianBlur(M,(0,0),2)
E=cv2.dilate(Ms,np.ones((81,81),np.uint8)); E=cv2.GaussianBlur(E,(0,0),40)
lit=((Ms>0.5*E)&(E>0.12)).astype(np.uint8)
np.save('E.npy',E)
lit=cv2.morphologyEx(lit,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7)))
hull=cv2.morphologyEx(lit,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(91,91)))
dark=((hull>0)&(lit==0)).astype(np.uint8)
def line_kernel(L,ang):
    k=np.zeros((L,L),np.uint8); c=L//2
    dx=np.cos(np.radians(ang)); dy=-np.sin(np.radians(ang))
    cv2.line(k,(int(c-dx*c),int(c-dy*c)),(int(c+dx*c),int(c+dy*c)),1,3)
    return k
bars=np.zeros_like(dark)
for a in list(range(5,40,3))+list(range(84,97,2)):
    bars|=cv2.morphologyEx(dark,cv2.MORPH_OPEN,line_kernel(171,a))
bars=cv2.dilate(bars,np.ones((9,9),np.uint8))
leaves=(dark&(1-bars)).astype(np.uint8)
leaves=cv2.morphologyEx(leaves,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
# keep only components in the leaf zone (exclude stray bits on patch borders)
n,lab,st,_=cv2.connectedComponentsWithStats(leaves)
keep=np.zeros_like(leaves)
for i in range(1,n):
    x,y,w,h,a=st[i]
    cx,cy=x+w/2,y+h/2
    if a>30 and 1550<cx<2350 and 350<cy<720: keep[lab==i]=1
cv2.imwrite('dbg-leaves.png',cv2.resize(np.dstack([keep*255,lit*255,bars*255]).astype(np.uint8),(1000,500)))
np.save('lit.npy',lit); np.save('leaves.npy',keep)
