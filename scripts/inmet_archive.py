"""Read selected members of the official annual INMET ZIP using HTTP byte ranges."""
import io,urllib.request,zipfile,pathlib,json,sys
class RemoteZip(io.RawIOBase):
    def __init__(self,url):
        self.url=url;self.pos=0;self.cache={}
        with urllib.request.urlopen(urllib.request.Request(url,method='HEAD',headers={'User-Agent':'Mozilla/5.0'}),timeout=60) as r:self.size=int(r.headers['Content-Length'])
    def seekable(self):return True
    def seek(self,n,whence=0):
        self.pos=n if whence==0 else self.pos+n if whence==1 else self.size+n
        return self.pos
    def tell(self):return self.pos
    def read(self,n=-1):
        if n<0:n=self.size-self.pos
        if n==0:return b''
        end=min(self.size,self.pos+n)-1
        req=urllib.request.Request(self.url,headers={'User-Agent':'Mozilla/5.0','Range':f'bytes={self.pos}-{end}'})
        key=(self.pos,end)
        if key not in self.cache:
            with urllib.request.urlopen(req,timeout=90) as r:
                if r.status!=206:raise RuntimeError('Server did not honor byte range')
                self.cache[key]=r.read()
        raw=self.cache[key];self.pos+=len(raw);return raw
def extract(year,codes,dest):
    url=f'https://portal.inmet.gov.br/uploads/dadoshistoricos/{year}.zip'
    dest=pathlib.Path(dest);dest.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(RemoteZip(url)) as archive:
        names=archive.namelist();out=[]
        for name in names:
            if not name.lower().endswith('.csv') or not any('_'+code+'_' in name for code in codes):continue
            target=dest/pathlib.Path(name).name
            if not target.exists():target.write_bytes(archive.read(name))
            out.append(dict(year=year,url=url,member=name,path=str(target)))
        return out
if __name__=='__main__':
    root=pathlib.Path(__file__).resolve().parents[1]
    result=extract(int(sys.argv[1]),['A515','A531','A524','A523','A556','A616','A529'],root.parent/'work/station-review/inmet')
    print(json.dumps(result,ensure_ascii=True))

