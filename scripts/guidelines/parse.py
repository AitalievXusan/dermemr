import json, re, glob, os, sys
HERE=os.path.dirname(os.path.abspath(__file__))
def ismark(c): return bool(c.strip()) and bool(re.fullmatch(r'[\s+\-−–—‒]+',c))
SKIP=re.compile(r'^(жалобы|объективн|физикальн|консультац|стол\s*№|\(врача\)|сбор жалоб|ежедневн|примечан|диета)',re.I)
def norm_name(n):
    n=re.sub(r'^\s*\d+\s*[\.\)]\s*','',n).strip()
    return n
def parse(path):
    rows=json.load(open(path,encoding='utf-8'))
    icd_txt=[];diag=[];drugs=[]
    mode=None;sub='основные';cat=None;last=None
    svp_x=None;cmp_x=None;pages_seen=set()
    for pg,r in rows:
        cells,xs=r['c'],r['x']
        txt=' '.join(c for c in cells if c); low=txt.lower()
        first=pg not in pages_seen; pages_seen.add(pg)
        if mode is None: icd_txt.append(txt)
        hdr=False
        for c,x in zip(cells,xs):
            if c.startswith('СВП'): svp_x=x; hdr=True
            if c.startswith('ЦМП') or c.startswith('МСП'): cmp_x=x; hdr=True
        compact=re.sub(r'\s+','',low)
        if compact.startswith('диагностические') or 'диагностическиемероприятия' in compact:
            if 'лечеб' not in low: mode='diag'; continue
        if ('лечебн' in compact and ('мер' in compact or 'оприят' in compact)) or 'медикаментозноеле' in compact or 'дозировкаи' in compact:
            mode='drug'
            if 'дополнит' in compact: sub='дополнительные'
            elif 'основн' in compact: sub='основные'
            continue
        if 'реабилитац' in compact and 'мероприят' in compact: mode='rehab'; continue
        if 'диспансер' in compact and ('наблюдени' in compact or 'мероприят' in compact) and not any(ismark(c) for c in cells): mode='rehab'; continue
        if hdr or any(k in txt for k in ('Амбулат','Виды и степень','Наименование медицинских','Название лекарств')): continue
        idx=[i for i,c in enumerate(cells) if ismark(c)]
        plus=[i for i in idx if '+' in cells[i]]
        def amb():
            if svp_x is None: return bool(idx) and '+' in cells[idx[0]]
            for i in plus:
                if xs[i] is not None and (abs(xs[i]-svp_x)<22 or (cmp_x is not None and abs(xs[i]-cmp_x)<22)): return True
            return False
        if mode=='drug':
            if plus:
                pre=[(i,c) for i,c in enumerate(cells[:idx[0]]) if c]
                post=[c for c in cells[idx[-1]+1:] if c]
                if not pre: continue
                L=r.get('l','').strip()
                DOSEY=re.compile(r'^(в/м|в/в|п/к|по |внутрь|•|таблет|раствор|капсул|рекоменд|взросл|детям|для |при |\d|коррекц|наружно|начальн|назнач|применя|мазь|крем|концентрат|флакон|ампул)',re.I)
                if L and not L.startswith('Примечание') and DOSEY.match(pre[0][1]):
                    pre=[(-1,L)]+pre
                name=norm_name(pre[0][1])
                if SKIP.match(name): continue
                last=dict(sub=sub,name=name,dose=' '.join(c for _,c in pre[1:]),amb=amb(),daily=post[0] if post else '',course=post[1] if len(post)>1 else '',page=pg,nx=xs[pre[0][0]] if pre[0][0]>=0 else 0)
                drugs.append(last)
            elif not idx and last and first and pg!=last['page']:
                for c,x in zip(cells,xs):
                    if not c: continue
                    if x is not None and last['nx'] is not None and x<=last['nx']+15: last['name']+=' '+c
                    else: last['dose']+=' '+c
        elif mode=='diag':
            if plus:
                pre=[c for c in cells[:idx[0]] if c]
                if not pre: continue
                if len(pre)>1: cat=pre[0]
                nm=norm_name(pre[-1])
                if SKIP.match(nm): continue
                diag.append(dict(cat=cat,name=nm,amb=amb()))
    for d in drugs: d.pop('nx',None)
    return dict(icd_txt=' '.join(icd_txt),diag=diag,drugs=drugs)
if __name__=='__main__':
    out={}
    for f in sorted(glob.glob(os.path.join(HERE,'grids','*.json'))):
        out[os.path.basename(f)[:-5]]=parse(f)
    json.dump(out,open(os.path.join(HERE,'parsed.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
    for k,v in out.items(): print(f"{len(v['diag']):3} diag {len(v['drugs']):3} drugs {sum(d['amb'] for d in v['drugs']):3} amb  {k}")
