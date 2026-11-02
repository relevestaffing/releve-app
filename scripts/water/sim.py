import numpy as np, cv2, sys
# Physically based caustics: an FFT water surface refracts parallel sunlight
# onto a plane below; photons are splatted to get the focused light pattern.
N=1536; OUT=768; L=4.0            # grid points, domain size (m)
T=6.0; FPS=24; F=int(T*FPS)
depth=2.2
rng=np.random.default_rng(7)
k=np.fft.fftfreq(N,L/N)*2*np.pi
KX,KY=np.meshgrid(k,k)
K=np.sqrt(KX**2+KY**2); K[0,0]=1e-6
wind=np.array([np.cos(.35),np.sin(.35)])
V=3.0; g=9.81; Lw=V*V/g
ph=np.exp(-1/(K*Lw)**2)/K**4*(np.abs((KX*wind[0]+KY*wind[1])/K)**6)*np.exp(-(K*0.03)**2)
ph[0,0]=0
sw=np.exp(-((K-2*np.pi/1.4)/1.2)**2)*np.abs((KX*wind[0]+KY*wind[1])/K)**10
ph=ph+ph.max()*0.0*sw
h0=(rng.normal(size=(N,N))+1j*rng.normal(size=(N,N)))*np.sqrt(ph/2)
w0=2*np.pi/T
omega=np.floor(np.sqrt(g*K)/w0)*w0      # quantised so the loop is seamless
n_ratio=1/1.33
def frame(t,dscale=1.0):
    e=np.exp(1j*omega*t)
    hk=h0*e+np.conj(np.roll(np.flip(h0,(0,1)),1,(0,1)))*np.conj(e)
    gx=np.real(np.fft.ifft2(1j*KX*hk)); gy=np.real(np.fft.ifft2(1j*KY*hk))
    s=0.9/max(1e-9,np.sqrt((gx**2+gy**2).mean()))*0.12   # normalise slope rms
    gx*=s; gy*=s
    xs=np.arange(N)[None,:]+np.zeros((N,1)); ys=np.arange(N)[:,None]+np.zeros((1,N))
    off=depth*dscale*(1-n_ratio)*N/L
    px=(xs-gx*off)%N; py=(ys-gy*off)%N
    img,_,_=np.histogram2d(py.ravel()*OUT/N,px.ravel()*OUT/N,bins=OUT,range=[[0,OUT],[0,OUT]])
    return img
if __name__=='__main__':
    im=frame(float(sys.argv[1]) if len(sys.argv)>1 else 0.)
    im=cv2.GaussianBlur(im,(0,0),.8)
    im=im/np.percentile(im,99.7)
    cv2.imwrite('test.png',(np.clip(im,0,1)**.8*255).astype('uint8'))
