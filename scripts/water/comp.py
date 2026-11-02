import numpy as np, cv2, sys
from sim import frame, OUT
W,H=1280,512
def setup():
    # wall plane: the periodic caustic texture laid across it in perspective,
    # lines running long and diagonal, compressed toward the top
    src=np.float32([[0,0],[OUT*1.0,0],[OUT*1.0,OUT],[0,OUT]])
    return None
def compose(img):
    big=np.tile(img,(3,3))
    c=OUT*1.5
    # rotate + stretch along the lines + perspective (far edge at top)
    ang=np.deg2rad(52)
    R=np.array([[np.cos(ang),-np.sin(ang)],[np.sin(ang),np.cos(ang)]])
    S=np.diag([0.36,1.05])
    A=R@S
    pts=np.float32([[-W/2,-H/2],[W/2,-H/2],[W/2,H/2],[-W/2,H/2]])
    # perspective: the top edge is farther, so it shows more texture
    persp=np.float32([[1.45,1.45],[1.45,1.45],[1,1],[1,1]])
    srcp=np.float32([c+(A@(p*s)) for p,s in zip(pts,persp[:,0])])
    dst=np.float32([[0,0],[W,0],[W,H],[0,H]])
    M=cv2.getPerspectiveTransform(dst,srcp)
    out=cv2.warpPerspective(big.astype(np.float32),M,(W,H),flags=cv2.WARP_INVERSE_MAP|cv2.INTER_LINEAR)
    return out
def colour(c,ref):
    c=cv2.GaussianBlur(c,(0,0),1.0)/ref
    bloom=cv2.GaussianBlur(c,(0,0),9)
    soft=cv2.GaussianBlur(c,(0,0),40)
    yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
    sun=np.exp(-(((xx-W*.88)/(W*.62))**2+((yy-H*.05)/(H*1.05))**2))
    reach=np.clip(.32+.68*np.clip(xx/(W*.62),0,1),0,1)
    wall0=np.array([.035,.06,.048]); wall1=np.array([.10,.145,.12])
    g=np.clip((xx/W)*.8+(1-yy/H)*.35,0,1)[...,None]
    wall=wall0+(wall1-wall0)*g
    light=np.array([.62,.80,.66])*(1-sun[...,None]*.6)+np.array([.95,.92,.76])*(sun[...,None]*.6)
    k=(sun*.85+.18)*reach
    col=wall*(.9+.35*sun[...,None]) + light*(np.clip(c,0,3)**1.15*1.05+bloom*.6+soft*.35)[...,None]*k[...,None]
    col=1-np.exp(-col*1.25)   # soft filmic shoulder
    return (np.clip(col,0,1)[...,::-1]*255).astype(np.uint8)
if __name__=='__main__':
    import os
    T=10.0; SLOW=0.6; FPS=24; n=int(T/SLOW*FPS)
    a,b=int(sys.argv[1]),int(sys.argv[2])
    ref=np.percentile(frame(0.),99.5)
    os.makedirs('frames',exist_ok=True)
    for i in range(a,min(b,n)):
        t=i/FPS*SLOW
        cv2.imwrite('frames/f%04d.png'%i,colour(compose(frame(t)),ref))
    print('done',a,b,n)
