#!/usr/bin/env python3
"""Статический линтер VBScript для скриптов COM-моста E3ProMax -> Zuken E3.series.
Проверяет: баланс блоков, повторные Dim, необъявленные переменные (Option Explicit) при записи и чтении,
вызовы несуществующих процедур и число аргументов. Использование: python3 scripts/vbslint.py file.vbs
"""
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()
lines = src.split('\n')
BUILTIN = set(x.lower() for x in """Abs Array Asc CBool CByte CDate CDbl Chr CInt CLng CreateObject CStr Date Day Err Exp Fix GetObject Hex Hour InStr InStrRev Int IsArray IsEmpty IsNull IsNumeric IsObject Join LBound LCase Left Len LTrim Mid Minute Month MsgBox Now Oct Replace Right Rnd Round RTrim Second Sgn Space Split Sqr StrComp String Trim UBound UCase Year WScript vbCrLf vbCr vbLf vbCritical vbExclamation vbInformation vbQuestion vbYesNoCancel vbYes vbNo vbCancel True False Nothing Empty Null And Or Not Mod Is Then Else ElseIf End If For To Step Next Each In Do Loop While Wend Until Sub Function Call Dim ReDim Preserve Set Exit Select Case On Error Resume GoTo Option Explicit ByVal ByRef Me New Const Xor Eqv Imp Rem""".split())
RESERVED=set(x.lower() for x in """and as boolean byref byte byval call case class const currency debug dim do double each else elseif empty end endif enum eqv erase error event exit false for function get goto if imp implements in integer is let like long loop lset me mod new next not nothing null on optional or paramarray preserve private public raiseevent redim rem resume rset select set shared single static stop sub then to true type typeof until variant wend while with xor""".split())
def strip(l):
    out=''; i=0; ins=False
    while i<len(l):
        c=l[i]
        if c=='"':
            if ins and i+1<len(l) and l[i+1]=='"': i+=2; continue
            ins=not ins; out+=' '; i+=1; continue
        if not ins and c=="'": break
        out+=' ' if ins else c; i+=1
    return out
errs=[]
procs={}; cur=None; globals_=set(); stack=[]
proc_bodies={}
for n,raw in enumerate(lines,1):
    l=strip(raw).strip()
    if not l: continue
    for stmt in re.split(r':(?![^()]*\))', l):
        st=stmt.strip()
        if not st: continue
        low=st.lower()
        m=re.match(r'(sub|function)\s+(\w+)\s*(\((.*)\))?',low)
        if m and not low.startswith('end '):
            if cur: errs.append(f"{n}: nested proc")
            name=m.group(2); params=set()
            if m.group(4):
                for p in m.group(4).split(','):
                    p=p.strip().replace('byval','').replace('byref','').strip()
                    if p: params.add(p)
            if name in procs: errs.append(f"{n}: duplicate proc {name}")
            procs[name]={'kind':m.group(1),'params':params,'locals':set(),'line':n,'uses':[]}
            cur=name; stack.append((m.group(1),n)); continue
        if re.match(r'end\s+(sub|function)\b',low):
            k=re.match(r'end\s+(sub|function)',low).group(1)
            if not stack or stack[-1][0]!=k: errs.append(f"{n}: unbalanced end {k} (stack top {stack[-1] if stack else None})")
            else: stack.pop()
            cur=None; continue
        md=re.match(r'(dim|redim(\s+preserve)?)\s+(.*)',low)
        if md:
            names=[re.match(r'\s*(\w+)',x).group(1) for x in re.split(r',(?![^()]*\))',md.group(3)) if re.match(r'\s*(\w+)',x)]
            if md.group(1)=='dim':
                tgt=procs[cur]['locals'] if cur else globals_
                for nm in names:
                    if nm in RESERVED: errs.append(f"{n}: reserved word used as variable name: {nm}")
                    if nm in tgt: errs.append(f"{n}: Name redefined {nm}")
                    if cur and nm in procs[cur]['params']: errs.append(f"{n}: Dim shadows param {nm}")
                    tgt.add(nm)
            else:
                for nm in names:
                    if cur: procs[cur]['uses'].append((n,nm))
                    elif nm not in globals_: errs.append(f"{n}: ReDim undeclared global {nm}")
            continue
        # block tracking
        if re.match(r'if\b',low):
            if re.search(r'\bthen\s*$',low): stack.append(('if',n))
        elif re.match(r'else\s*if\b|elseif\b',low): pass
        elif re.match(r'end\s+if\b',low):
            if not stack or stack[-1][0]!='if': errs.append(f"{n}: unbalanced End If {stack[-1] if stack else ''}")
            else: stack.pop()
        elif re.match(r'for\b',low): stack.append(('for',n))
        elif re.match(r'next\b',low):
            if not stack or stack[-1][0]!='for': errs.append(f"{n}: unbalanced Next")
            else: stack.pop()
        elif re.match(r'select\s+case\b',low): stack.append(('select',n))
        elif re.match(r'end\s+select\b',low):
            if not stack or stack[-1][0]!='select': errs.append(f"{n}: unbalanced End Select")
            else: stack.pop()
        elif re.match(r'(do|while)\b',low): stack.append(('loop',n))
        elif re.match(r'(loop|wend)\b',low):
            if stack and stack[-1][0]=='loop': stack.pop()
        # assignment targets & identifiers
        ma=re.match(r'(set\s+)?(\w+)\s*(\([^=]*\))?\s*=',low)
        target=None
        if ma and not re.match(r'(if|elseif|for|case|call|do|while)\b',low):
            target=ma.group(2)
        mf=re.match(r'for\s+(each\s+)?(\w+)',low)
        if mf: target=mf.group(2)
        # also single-line If ... Then x = y
        mi=re.search(r'\bthen\s+(set\s+)?(\w+)\s*(\([^=]*\))?\s*=',low)
        tgts=[t for t in [target, mi.group(2) if mi else None] if t]
        for t in tgts:
            if cur: procs[cur]['uses'].append((n,t))
            elif t not in globals_ and t not in BUILTIN: errs.append(f"{n}: undeclared global assign {t}")
        # calls
        for mc in re.finditer(r'\bcall\s+(\w+)\b(?!\s*\.)',low):
            procs.setdefault('__calls__',{'calls':[]}).setdefault('calls',[]).append((n,mc.group(1)))
if stack: errs.append(f"unclosed blocks: {stack[:5]}")
calls=procs.pop('__calls__',{'calls':[]})['calls']
for name,p in procs.items():
    for n,t in p['uses']:
        if t==name: continue  # function return
        if t in p['params'] or t in p['locals'] or t in globals_ or t in BUILTIN: continue
        errs.append(f"{n}: undeclared var '{t}' in {name}")
for n,c in calls:
    if c not in procs and c not in BUILTIN: errs.append(f"{n}: Call to undefined proc {c}")
# usage of functions with wrong arity (rough): for each defined proc, count args in calls "Name("
arity={k:len(v['params']) for k,v in procs.items()}
for n,raw in enumerate(lines,1):
    l=strip(raw)
    for name,a in arity.items():
        for m in re.finditer(r'\b'+name+r'\s*\(', l, re.I):
            if re.match(r'\s*(sub|function)\s', l, re.I): continue
            i=m.end(); depth=1; args=1; j=i; empty=True
            while j<len(l) and depth>0:
                ch=l[j]
                if ch=='(':depth+=1
                elif ch==')':depth-=1
                elif ch==',' and depth==1: args+=1
                if depth>0 and not ch.isspace(): empty=False
                j+=1
            if empty: args=0
            if depth==0 and args!=a: errs.append(f"{n}: {name} called with {args} args, expects {a}")
KW=set(x.lower() for x in "then else elseif end if for to step next each in do loop while wend until sub function call dim redim preserve set exit select case on error resume goto option explicit byval byref and or not mod is new const xor true false nothing empty null".split())
METHODS_OK=set()
procnames=set(procs.keys())
errs2=[]
cur=None
for n,raw in enumerate(lines,1):
    l=strip(raw)
    low=l.lower().strip()
    m=re.match(r'(sub|function)\s+(\w+)',low)
    if m and not low.startswith('end'): cur=m.group(2); continue
    if re.match(r'end\s+(sub|function)',low): cur=None; continue
    if re.match(r'(dim)\b',low): continue
    for mt in re.finditer(r'(?<![\w.])([a-z_]\w*)(?!\w)',low):
        t=mt.group(1); end=mt.end()
        rest=low[end:end+1]
        if rest=='.' : 
            pass  # object var, still must be declared
        if t in KW or t in BUILTIN or t in procnames or t in globals_: continue
        if cur and (t in procs[cur]['params'] or t in procs[cur]['locals'] or t==cur): continue
        errs2.append(f"{n}: undeclared read '{t}' in {cur}")
allerr=errs+errs2
print("\n".join(allerr[:120]) or "OK")
print(f"procs={len(procs)} errors={len(allerr)}")
sys.exit(1 if allerr else 0)
