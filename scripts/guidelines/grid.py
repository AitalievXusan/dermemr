import pdfplumber, sys, json, re
def page_rows(p):
    rs=p.rects+[dict(x0=l['x0'],x1=l['x1'],top=l['top'],bottom=l['bottom'],width=l['x1']-l['x0'],height=l['bottom']-l['top']) for l in p.lines]
    hz=sorted(set(round((r['top']+r['bottom'])/2,1) for r in rs if r['height']<2.5 and r['width']>15))
    vt=sorted(set(round((r['x0']+r['x1'])/2,1) for r in rs if r['width']<2.5 and r['height']>8))
    def dedup(v):
        o=[]
        for x in v:
            if not o or x-o[-1]>2: o.append(x)
        return o
    hz,vt=dedup(hz),dedup(vt)
    if len(hz)<2 or len(vt)<2: return []
    ts={"vertical_strategy":"explicit","horizontal_strategy":"explicit","explicit_vertical_lines":vt,"explicit_horizontal_lines":hz,"intersection_tolerance":4}
    out=[]
    words=p.extract_words()
    for t in p.find_tables(ts):
        for row,r in zip(t.rows,t.extract()):
            cells=[re.sub(r'\s+',' ',(c or '')).strip() for c in r]
            xs=[round((b[0]+b[2])/2) if b else None for b in row.cells]
            bx=[b for b in row.cells if b]
            left=''
            if bx:
                x0=min(b[0] for b in bx); top=min(b[1] for b in bx); bot=max(b[3] for b in bx)
                lw=[w for w in words if w['x1']<=x0+1 and w['top']>=top-1 and w['bottom']<=bot+1]
                left=' '.join(w['text'] for w in sorted(lw,key=lambda w:(round(w['top']),w['x0'])))
            if any(cells): out.append({'c':cells,'x':xs,'l':left})
    return out
if __name__=='__main__':
    res=[]
    with pdfplumber.open(sys.argv[1]) as pdf:
        for i,p in enumerate(pdf.pages):
            for r in page_rows(p): res.append([i+1,r])
    json.dump(res,open(sys.argv[2],'w',encoding='utf-8'),ensure_ascii=False)
