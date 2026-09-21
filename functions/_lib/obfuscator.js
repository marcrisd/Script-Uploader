const TK_NAME=1, TK_NUMBER=2, TK_STRING=3, TK_OP=4, TK_EOF=5;
const KEYWORDS = new Set([
  'and','break','continue','do','else','elseif','end','false','for','function','goto',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while'
]);

function tokenize(src){
  const tokens = [];
  let i = 0;
  const n = src.length;
  function adv(){ return src[i++]; }

  while(i < n){
    // whitespace
    if(' \t\r\n'.includes(src[i])){ i++; continue; }
    // comment
    if(src[i]==='-' && src[i+1]==='-'){
      i+=2;
      if(src[i]==='['){
        let lvl=0, j=i+1;
        while(src[j]==='='){lvl++;j++;}
        if(src[j]==='['){
          i=j+1;
          const close=']'+('='.repeat(lvl))+']';
          const end=src.indexOf(close,i);
          i = end===-1?n:end+close.length;
          continue;
        }
      }
      while(i<n && src[i]!=='\n') i++;
      continue;
    }
    // long string
    if(src[i]==='[' && (src[i+1]==='[' || src[i+1]==='=')){
      let lvl=0, j=i+1;
      while(src[j]==='='){lvl++;j++;}
      if(src[j]==='['){
        const start=j+1; i=start;
        const close=']'+('='.repeat(lvl))+']';
        const end=src.indexOf(close,i);
        const val = end===-1?src.slice(start):src.slice(start,end);
        i = end===-1?n:end+close.length;
        tokens.push({t:TK_STRING, v:val});
        continue;
      }
    }
    // quoted string
    if(src[i]==='"' || src[i]==="'"){
      const q=adv(); let s='';
      while(i<n && src[i]!==q){
        if(src[i]==='\\'){
          i++;
          const c=adv();
          if(c==='n') s+='\n';
          else if(c==='t') s+='\t';
          else if(c==='r') s+='\r';
          else if(c==='"') s+='"';
          else if(c==="'") s+="'";
          else if(c==='\\') s+='\\';
          else if(c==='a') s+='\x07';
          else if(c==='b') s+='\x08';
          else if(c==='f') s+='\x0C';
          else if(c==='v') s+='\x0B';
          else if(c>='0'&&c<='9'){
            let nd=c;
            if(i<n&&src[i]>='0'&&src[i]<='9') nd+=adv();
            if(i<n&&src[i]>='0'&&src[i]<='9') nd+=adv();
            s+=String.fromCharCode(parseInt(nd));
          } else if(c==='x'){
            const h=adv()+adv();
            s+=String.fromCharCode(parseInt(h,16));
          } else if(c==='u'){
            i++; // skip {
            let hex='';
            while(i<n && src[i]!=='}') hex+=adv();
            i++; // skip }
            s+=String.fromCodePoint(parseInt(hex,16));
          } else if(c==='z'){
            // \z skips subsequent whitespace
            while(i<n && (src[i]===' '||src[i]==='\t'||src[i]==='\n'||src[i]==='\r')) i++;
          } else s+=c;
        } else s+=adv();
      }
      if(src[i]===q) i++;
      tokens.push({t:TK_STRING, v:s});
      continue;
    }
    // interpolated string (backtick)
    if(src[i]==='`'){
      i++; // skip opening backtick
      // Collect segments: {kind:'text',v:str} or {kind:'expr',tokens:[...]}
      const segs=[];
      let txt='';
      while(i<n && src[i]!=='`'){
        if(src[i]==='\\'){
          i++;
          const c=src[i++]||'';
          if(c==='n') txt+='\n'; else if(c==='t') txt+='\t'; else if(c==='r') txt+='\r';
          else if(c==='\\') txt+='\\'; else if(c==='`') txt+='`'; else if(c==='{') txt+='{';
          else txt+=c;
        } else if(src[i]==='{'){
          if(txt){ segs.push({kind:'text',v:txt}); txt=''; }
          i++; // skip {
          // Extract expression source between { and matching }
          // String-aware: skip over quoted strings so } inside them doesn't break matching
          let depth=1, exprSrc='';
          while(i<n && depth>0){
            if(src[i]==='"' || src[i]==="'"){
              // Skip quoted string
              const q=src[i]; exprSrc+=src[i++];
              while(i<n && src[i]!==q){
                if(src[i]==='\\' && i+1<n){ exprSrc+=src[i++]; }
                exprSrc+=src[i++];
              }
              if(i<n) exprSrc+=src[i++]; // closing quote
            } else if(src[i]==='[' && (src[i+1]==='[' || src[i+1]==='=')){
              // Skip long string [[...]] or [=[...]=] etc
              let lvl=0,j=i+1;
              while(j<n && src[j]==='='){lvl++;j++;}
              if(j<n && src[j]==='['){
                const cls=']'+'='.repeat(lvl)+']';
                exprSrc+=src.slice(i,j+1); i=j+1;
                const ce=src.indexOf(cls,i);
                if(ce===-1){ exprSrc+=src.slice(i); i=n; }
                else { exprSrc+=src.slice(i,ce+cls.length); i=ce+cls.length; }
              } else { exprSrc+=src[i++]; }
            } else if(src[i]==='-' && src[i+1]==='-'){
              // Skip comment
              exprSrc+=src[i++]+src[i++];
              if(src[i]==='['){
                let lvl2=0,j2=i+1;
                while(j2<n && src[j2]==='='){lvl2++;j2++;}
                if(j2<n && src[j2]==='['){
                  const cls2=']'+'='.repeat(lvl2)+']';
                  exprSrc+=src.slice(i,j2+1); i=j2+1;
                  const ce2=src.indexOf(cls2,i);
                  if(ce2===-1){ exprSrc+=src.slice(i); i=n; }
                  else { exprSrc+=src.slice(i,ce2+cls2.length); i=ce2+cls2.length; }
                } else { while(i<n && src[i]!=='\n') exprSrc+=src[i++]; }
              } else { while(i<n && src[i]!=='\n') exprSrc+=src[i++]; }
            } else {
              if(src[i]==='{') depth++;
              else if(src[i]==='}') { depth--; if(depth===0){ i++; break; } }
              exprSrc+=src[i++];
            }
          }
          // Tokenize the inner expression
          segs.push({kind:'expr',tokens:tokenize(exprSrc)});
        } else {
          txt+=src[i++];
        }
      }
      if(src[i]==='`') i++; // skip closing backtick
      if(txt) segs.push({kind:'text',v:txt});
      // Convert to concatenation tokens: (seg1 .. seg2 .. ...)
      // Each expr seg is wrapped in tostring(expr)
      if(segs.length===0){
        tokens.push({t:TK_STRING, v:''});
      } else if(segs.length===1 && segs[0].kind==='text'){
        tokens.push({t:TK_STRING, v:segs[0].v});
      } else {
        tokens.push({t:TK_OP, v:'('});
        for(let si=0;si<segs.length;si++){
          if(si>0) tokens.push({t:TK_OP, v:'..'});
          const seg=segs[si];
          if(seg.kind==='text'){
            tokens.push({t:TK_STRING, v:seg.v});
          } else {
            // tostring(expr)
            tokens.push({t:TK_NAME, v:'tostring'});
            tokens.push({t:TK_OP, v:'('});
            // Push expr tokens (minus the trailing TK_EOF)
            for(let ei=0;ei<seg.tokens.length;ei++){
              if(seg.tokens[ei].t!==TK_EOF) tokens.push(seg.tokens[ei]);
            }
            tokens.push({t:TK_OP, v:')'});
          }
        }
        tokens.push({t:TK_OP, v:')'});
      }
      continue;
    }
    // number
    if((src[i]>='0'&&src[i]<='9') || (src[i]==='.'&&src[i+1]>='0'&&src[i+1]<='9')){
      let s='';
      if(src[i]==='0' && (src[i+1]==='x'||src[i+1]==='X')){
        s+=adv()+adv();
        while(i<n && /[0-9a-fA-F_]/.test(src[i])) s+=adv();
      } else {
        while(i<n && (src[i]>='0'&&src[i]<='9' || src[i]==='_')) s+=adv();
        if(i<n && src[i]==='.') {
          s+=adv();
          while(i<n && (src[i]>='0'&&src[i]<='9' || src[i]==='_')) s+=adv();
        }
        if(i<n && (src[i]==='e'||src[i]==='E')){
          s+=adv();
          if(src[i]==='+'||src[i]==='-') s+=adv();
          while(i<n && src[i]>='0'&&src[i]<='9') s+=adv();
        }
      }
      tokens.push({t:TK_NUMBER, v:Number(s.replace(/_/g,''))});
      continue;
    }
    // name / keyword
    if(/[a-zA-Z_]/.test(src[i])){
      let s='';
      while(i<n && /[a-zA-Z0-9_]/.test(src[i])) s+=adv();
      if(KEYWORDS.has(s)) tokens.push({t:s});
      else tokens.push({t:TK_NAME, v:s});
      continue;
    }
    // operators
    const c1=src[i], c2=src[i+1], c3=src[i+2];
    if(c1==='.'&&c2==='.'&&c3==='.'){ tokens.push({t:TK_OP,v:'...'}); i+=3; continue; }
    if(c1==='.'&&c2==='.'&&c3==='='){ tokens.push({t:TK_OP,v:'..='}); i+=3; continue; }
    if(c1==='/'&&c2==='/'&&c3==='='){ tokens.push({t:TK_OP,v:'//='}); i+=3; continue; }
    const two=c1+c2;
    if(['==','~=','<=','>=','..','//','>>','<<','::','+=','-=','*=','/=','%=','^='].includes(two)){ tokens.push({t:TK_OP,v:two}); i+=2; continue; }
    if('+-*/%^#&|~<>=(){}[];:,.'.includes(c1)){ tokens.push({t:TK_OP,v:c1}); i++; continue; }
    i++;
  }
  tokens.push({t:TK_EOF});
  return tokens;
}

// ‚îÄ‚îÄ‚îÄ PARSER ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
function parse(tokens){
  let pos = 0;
  function cur(){ return tokens[pos]; }
  function peek(off){ return tokens[pos+(off||0)]; }
  function adv(){ return tokens[pos++]; }
  function expect(t,v){
    const tk=adv();
    if(v!==undefined && tk.v!==v && tk.t!==v) throw new Error("Expected '"+v+"' got '"+(tk.v||tk.t)+"'");
    if(v===undefined && tk.t!==t) throw new Error("Expected type "+t+" got "+tk.t);
    return tk;
  }
  function check(t,v){
    const tk=cur();
    if(v!==undefined) return tk.v===v || tk.t===v;
    return tk.t===t || tk.v===t;
  }
  function match_(t,v){
    if(check(t,v)){ adv(); return true; }
    return false;
  }

  // Skip Luau type annotation after ':' has been consumed.
  // Consumes tokens until hitting a terminator (=, ,, ), }, ;, keyword) at depth 0.
  function skipTypeAnnotation(){
    var depth=0;
    while(cur().t!==TK_EOF){
      var tk=cur();
      // Handle -> arrow (two separate tokens: '-' '>')
      if(tk.t===TK_OP && tk.v==='-'){
        if(peek(1) && peek(1).t===TK_OP && peek(1).v==='>'){ adv(); adv(); continue; }
        if(depth===0) break;
      }
      if(depth===0){
        if(tk.t===TK_OP && (tk.v==='=' || tk.v===';' || tk.v===',')) break;
        if(tk.t===TK_OP && (tk.v===')' || tk.v==='}')) break;
        if(KEYWORDS.has(tk.t) && tk.t!=='nil' && tk.t!=='true' && tk.t!=='false') break;
      }
      if(tk.t===TK_OP && (tk.v==='(' || tk.v==='{' || tk.v==='<')) depth++;
      // Handle >> as two > closers (nested generics like Map<Array<number>>)
      if(tk.t===TK_OP && tk.v==='>>'){
        if(depth>=2){ depth-=2; adv(); continue; }
        else if(depth===1){ depth--; adv(); continue; }
        else break;
      }
      if(tk.t===TK_OP && (tk.v===')' || tk.v==='}' || tk.v==='>')){
        if(depth>0) depth--;
        else break;
      }
      adv();
    }
  }
  // Skip optional generic type params <T, U, ...> before function '('
  function skipGenericParams(){
    if(cur().t===TK_OP && cur().v==='<'){
      adv();
      var gd=1;
      while(gd>0 && cur().t!==TK_EOF){
        if(cur().v==='<') gd++;
        else if(cur().v==='>>') { gd-=2; if(gd<=0) break; }
        else if(cur().v==='>') { gd--; if(gd===0) break; }
        adv();
      }
      if(cur().v==='>' || cur().v==='>>') adv();
    }
  }

  function parseBlock(){
    const stmts=[];
    while(true){
      const tk=cur();
      if(tk.t===TK_EOF||tk.t==='end'||tk.t==='else'||tk.t==='elseif'||tk.t==='until') break;
      if(tk.t==='return'){ stmts.push(parseReturn()); match_(TK_OP,';'); break; }
      const s=parseStatement();
      if(s) stmts.push(s);
      match_(TK_OP,';');
    }
    return {k:'block',body:stmts};
  }

  function parseReturn(){
    adv();
    const vals=[];
    const tk=cur();
    if(tk.t!==TK_EOF&&tk.t!=='end'&&tk.t!=='else'&&tk.t!=='elseif'&&tk.t!=='until'&&!(tk.t===TK_OP&&tk.v===';')){
      vals.push(parseExpr());
      while(match_(TK_OP,',')) vals.push(parseExpr());
    }
    return {k:'return',vals};
  }

  function parseStatement(){
    const tk=cur();
    if(tk.t===TK_OP&&tk.v===';'){ adv(); return null; }
    if(tk.t==='do'){ adv(); const b=parseBlock(); expect('end'); return {k:'do',body:b}; }
    if(tk.t==='while') return parseWhile();
    if(tk.t==='repeat') return parseRepeat();
    if(tk.t==='if') return parseIf();
    if(tk.t==='for') return parseFor();
    if(tk.t==='function') return parseFuncDef();
    if(tk.t==='local') return parseLocal();
    if(tk.t==='goto'){ adv(); return {k:'goto',name:expect(TK_NAME).v}; }
    if(tk.t==='break'){ adv(); return {k:'break'}; }
    if(tk.t==='continue'){ adv(); return {k:'continue'}; }
    if(tk.t===TK_OP&&tk.v==='::'){ adv(); const name=expect(TK_NAME).v; expect(TK_OP,'::'); return {k:'label',name}; }
    return parseExprStat();
  }

  function parseWhile(){
    adv();
    const cond=parseExpr(); expect('do');
    const body=parseBlock(); expect('end');
    return {k:'while',cond,body};
  }
  function parseRepeat(){
    adv();
    const body=parseBlock(); expect('until');
    const cond=parseExpr();
    return {k:'repeat',body,cond};
  }
  function parseIf(){
    adv();
    const cond=parseExpr(); expect('then');
    const then_=parseBlock();
    const elseifs=[];
    let else_=null;
    while(check('elseif')){ adv(); const c=parseExpr(); expect('then'); elseifs.push({cond:c,body:parseBlock()}); }
    if(match_('else')) else_=parseBlock();
    expect('end');
    return {k:'if',cond,then:then_,elseifs,else_};
  }
  function parseFor(){
    adv();
    const name=expect(TK_NAME).v;
    if(cur().t===TK_OP&&cur().v===':'){ adv(); skipTypeAnnotation(); }
    if(match_(TK_OP,'=')){
      const start=parseExpr(); expect(TK_OP,',');
      const limit=parseExpr();
      const step=match_(TK_OP,',') ? parseExpr() : null;
      expect('do'); const body=parseBlock(); expect('end');
      return {k:'numfor',name,start,limit,step,body};
    } else {
      const names=[name];
      while(match_(TK_OP,',')){
        names.push(expect(TK_NAME).v);
        if(cur().t===TK_OP&&cur().v===':'){ adv(); skipTypeAnnotation(); }
      }
      expect('in');
      const iters=[parseExpr()];
      while(match_(TK_OP,',')) iters.push(parseExpr());
      expect('do'); const body=parseBlock(); expect('end');
      return {k:'genfor',names,iters,body};
    }
  }
  function parseFuncDef(){
    adv();
    let base={k:'name',n:expect(TK_NAME).v};
    let method=false;
    while(match_(TK_OP,'.')) base={k:'field',obj:base,f:expect(TK_NAME).v};
    if(match_(TK_OP,':')){ base={k:'field',obj:base,f:expect(TK_NAME).v}; method=true; }
    return {k:'funcdef',target:base,func:parseFuncBody(method)};
  }
  function parseLocal(){
    adv();
    if(match_('function')){
      const name=expect(TK_NAME).v;
      return {k:'localfunc',name,func:parseFuncBody(false)};
    }
    const names=[expect(TK_NAME).v];
    // skip : type annotation
    if(cur().t===TK_OP&&cur().v===':'){ adv(); skipTypeAnnotation(); }
    // skip <attr>
    if(cur().t===TK_OP&&cur().v==='<'){ adv(); adv(); expect(TK_OP,'>'); }
    while(match_(TK_OP,',')){
      names.push(expect(TK_NAME).v);
      if(cur().t===TK_OP&&cur().v===':'){ adv(); skipTypeAnnotation(); }
      if(cur().t===TK_OP&&cur().v==='<'){ adv(); adv(); expect(TK_OP,'>'); }
    }
    let vals=[];
    if(match_(TK_OP,'=')){
      vals.push(parseExpr());
      while(match_(TK_OP,',')) vals.push(parseExpr());
    }
    return {k:'local',names,vals};
  }
  function parseFuncBody(method){
    skipGenericParams();
    expect(TK_OP,'(');
    const params=[];
    let vararg=false;
    if(method) params.push('self');
    if(!check(TK_OP,')')){
      if(check(TK_OP,'...')){ adv(); vararg=true; }
      else {
        params.push(expect(TK_NAME).v);
        if(cur().t===TK_OP&&cur().v===':'){ adv(); skipTypeAnnotation(); }
        while(match_(TK_OP,',')){
          if(check(TK_OP,'...')){ adv(); vararg=true; break; }
          params.push(expect(TK_NAME).v);
          if(cur().t===TK_OP&&cur().v===':'){ adv(); skipTypeAnnotation(); }
        }
      }
    }
    expect(TK_OP,')');
    // Skip return type annotation
    if(cur().t===TK_OP&&cur().v===':'){ adv(); skipTypeAnnotation(); }
    const body=parseBlock(); expect('end');
    return {k:'func',params,vararg,body};
  }
  function parseExprStat(){
    const e=parseSuffixedExpr();
    // Compound assignment: +=, -=, *=, /=, %=, ^=, ..=
    const _compoundOps={'+=':'+','-=':'-','*=':'*','/=':'/','%=':'%','^=':'^','..=':'..','//=':'//'};
    if(cur().t===TK_OP && _compoundOps[cur().v]){
      const binOp=_compoundOps[adv().v];
      const rhs=parseExpr();
      // For simple names, desugar directly (no side effects to worry about)
      if(e.k==='name'){
        return {k:'assign',targets:[e],vals:[{k:'binop',op:binOp,l:e,r:rhs}]};
      }
      // For field/index, use dedicated node to avoid double-evaluation
      return {k:'compassign',target:e,op:binOp,rhs};
    }
    if(check(TK_OP,',') || check(TK_OP,'=')){
      const targets=[e];
      while(match_(TK_OP,',')) targets.push(parseSuffixedExpr());
      expect(TK_OP,'=');
      const vals=[parseExpr()];
      while(match_(TK_OP,',')) vals.push(parseExpr());
      return {k:'assign',targets,vals};
    }
    if(e.k==='call'||e.k==='callm') return {k:'callstat',e};
    throw new Error('Unexpected expression statement: '+e.k);
  }

  function parseExpr(){ return parseOr(); }
  function parseOr(){
    let e=parseAnd();
    while(check('or')){ adv(); e={k:'binop',op:'or',l:e,r:parseAnd()}; }
    return e;
  }
  function parseAnd(){
    let e=parseCmp();
    while(check('and')){ adv(); e={k:'binop',op:'and',l:e,r:parseCmp()}; }
    return e;
  }
  function parseCmp(){
    let e=parseBitOr();
    while(cur().t===TK_OP && ['<','>','<=','>=','==','~='].includes(cur().v)){ const op=adv().v; e={k:'binop',op,l:e,r:parseBitOr()}; }
    return e;
  }
  function parseBitOr(){
    let e=parseBitXor();
    while(cur().t===TK_OP && cur().v==='|'){ adv(); e={k:'binop',op:'|',l:e,r:parseBitXor()}; }
    return e;
  }
  function parseBitXor(){
    let e=parseBitAnd();
    while(cur().t===TK_OP && cur().v==='~'&&peek(1)&&peek(1).t===TK_OP){ adv(); e={k:'binop',op:'~',l:e,r:parseBitAnd()}; }
    return e;
  }
  function parseBitAnd(){
    let e=parseBitShift();
    while(cur().t===TK_OP && cur().v==='&'){ adv(); e={k:'binop',op:'&',l:e,r:parseBitShift()}; }
    return e;
  }
  function parseBitShift(){
    let e=parseConcat();
    while(cur().t===TK_OP && (cur().v==='>>'||cur().v==='<<')){ const op=adv().v; e={k:'binop',op,l:e,r:parseConcat()}; }
    return e;
  }
  function parseConcat(){
    const e=parseAdd();
    if(cur().t===TK_OP && cur().v==='..'){ adv(); return {k:'binop',op:'..',l:e,r:parseConcat()}; }
    return e;
  }
  function parseAdd(){
    let e=parseMul();
    while(cur().t===TK_OP && (cur().v==='+'||cur().v==='-')){ const op=adv().v; e={k:'binop',op,l:e,r:parseMul()}; }
    return e;
  }
  function parseMul(){
    let e=parseUnary();
    while(cur().t===TK_OP && ['*','/','%','//'].includes(cur().v)){ const op=adv().v; e={k:'binop',op,l:e,r:parseUnary()}; }
    return e;
  }
  function parseUnary(){
    if(cur().t==='not'){ adv(); return {k:'unop',op:'not',e:parseUnary()}; }
    if(cur().t===TK_OP && cur().v==='-'){ adv(); return {k:'unop',op:'-',e:parseUnary()}; }
    if(cur().t===TK_OP && cur().v==='#'){ adv(); return {k:'unop',op:'#',e:parseUnary()}; }
    if(cur().t===TK_OP && cur().v==='~'){ adv(); return {k:'unop',op:'~',e:parseUnary()}; }
    return parsePower();
  }
  function parsePower(){
    const e=parseSuffixedExpr();
    if(cur().t===TK_OP && cur().v==='^'){ adv(); return {k:'binop',op:'^',l:e,r:parseUnary()}; }
    return e;
  }
  function parseSuffixedExpr(){
    let e=parsePrimaryExpr();
    while(true){
      if(cur().v==='.'){ adv(); e={k:'field',obj:e,f:expect(TK_NAME).v}; }
      else if(cur().v==='['){ adv(); const idx=parseExpr(); expect(TK_OP,']'); e={k:'index',obj:e,idx}; }
      else if(cur().v===':'){ adv(); const m=expect(TK_NAME).v; e={k:'callm',obj:e,m,args:parseCallArgs()}; }
      else if(cur().v==='('||cur().t===TK_STRING||cur().v==='{'){ e={k:'call',f:e,args:parseCallArgs()}; }
      else if(cur().v==='::'){
        // Disambiguate: :: NAME :: is a label statement, not a type cast
        if(peek(1)&&peek(1).t===TK_NAME&&peek(2)&&peek(2).t===TK_OP&&peek(2).v==='::') break;
        adv(); skipTypeAnnotation();
      }
      else break;
    }
    return e;
  }
  function parseCallArgs(){
    if(cur().v==='('){
      adv();
      const args=[];
      if(!check(TK_OP,')')){
        args.push(parseExpr());
        while(match_(TK_OP,',')) args.push(parseExpr());
      }
      expect(TK_OP,')'); return args;
    }
    if(cur().t===TK_STRING){ return [{k:'str',v:adv().v}]; }
    if(cur().v==='{'){ return [parseTableConstructor()]; }
    throw new Error('Expected call args');
  }
  function parsePrimaryExpr(){
    const tk=cur();
    if(tk.t===TK_NAME){ adv(); return {k:'name',n:tk.v}; }
    if(tk.v==='('){ adv(); const e=parseExpr(); expect(TK_OP,')'); return {k:'paren',e}; }
    return parseSimpleExpr();
  }
  function parseSimpleExpr(){
    const tk=cur();
    if(tk.t===TK_NUMBER){ adv(); return {k:'num',v:tk.v}; }
    if(tk.t===TK_STRING){ adv(); return {k:'str',v:tk.v}; }
    if(tk.t==='nil'){ adv(); return {k:'nil'}; }
    if(tk.t==='true'){ adv(); return {k:'true'}; }
    if(tk.t==='false'){ adv(); return {k:'false'}; }
    if(tk.v==='...'){ adv(); return {k:'vararg'}; }
    if(tk.t==='function'){ adv(); return parseFuncBody(false); }
    if(tk.v==='{'){ return parseTableConstructor(); }
    // Luau if-then-else expression
    if(tk.t==='if'){ return parseIfExpr(); }
    const _ctx=tokens.slice(Math.max(0,pos-4),pos+4).map(function(t){return t.v||t.t;}).join(' ');
    throw new Error('Unexpected token: '+(tk.v||tk.t)+' near ['+_ctx+']');
  }
  function parseIfExpr(){
    adv(); // skip 'if'
    const cond=parseExpr(); expect('then');
    const then_=parseExpr();
    const elseifs=[];
    while(check('elseif')){ adv(); const c=parseExpr(); expect('then'); elseifs.push({cond:c,val:parseExpr()}); }
    expect('else');
    const else_=parseExpr();
    return {k:'ifexpr',cond,then_:then_,elseifs,else_};
  }
  function parseTableConstructor(){
    expect(TK_OP,'{');
    const fields=[];
    while(!check(TK_OP,'}')){
      if(cur().v==='['){
        adv(); const key=parseExpr(); expect(TK_OP,']'); expect(TK_OP,'=');
        fields.push({k:'kv',key,val:parseExpr()});
      } else if(cur().t===TK_NAME && peek(1).v==='='){
        const key=adv().v; adv();
        fields.push({k:'nv',key,val:parseExpr()});
      } else {
        fields.push({k:'v',val:parseExpr()});
      }
      if(!match_(TK_OP,',') && !match_(TK_OP,';')) break;
    }
    expect(TK_OP,'}'); return {k:'tbl',fields};
  }

  return parseBlock();
}

// ‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê
// ‚îÄ‚îÄ‚îÄ BYTECODE VM MODE ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// ‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê‚ïê

// ‚îÄ‚îÄ‚îÄ INSTRUCTION SET ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
var BC={
  MOVE:0,LOADK:1,LOADBOOL:2,LOADNIL:3,
  GETUPVAL:4,SETUPVAL:5,GETGLOBAL:6,SETGLOBAL:7,
  GETTABLE:8,SETTABLE:9,NEWTABLE:10,SELF:11,
  ADD:12,SUB:13,MUL:14,DIV:15,MOD:16,POW:17,IDIV:18,
  UNM:19,NOT:20,LEN:21,CONCAT:22,
  JMP:23,EQ:24,LT:25,LE:26,TEST:27,TESTSET:28,
  CALL:29,TAILCALL:30,RETURN:31,
  FORLOOP:32,FORPREP:33,TFORCALL:34,TFORLOOP:35,
  SETLIST:36,CLOSURE:37,VARARG:38,
  BAND:39,BOR:40,BXOR:41,SHL:42,SHR:43,BNOT:44,
  NOP:45,CLOSE:46,
  SUPER_MRET:47,SUPER_KRET:48,SUPER_GCALL:49,
  SUPER_SELF_CALL:50,SUPER_TEST_JMP:51,SUPER_GETTAB_CALL:52
};
var BC_COUNT=53;
var GARBAGE_OP=255;

function bcEncode(op,a,b,c){return(op&0xFF)|((a&0xFF)<<8)|((b&0xFF)<<16)|((c&0xFF)<<24);}
function bcEncodeBx(op,a,bx){return(op&0xFF)|((a&0xFF)<<8)|((bx&0xFFFF)<<16);}
function bcEncodesBx(op,a,sbx){return bcEncodeBx(op,a,sbx+32767);}

// ‚îÄ‚îÄ‚îÄ COMPILER SCOPE ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
function BCScope(parent,proto){
  this.parent=parent;
  this.proto=proto;
  this.locals={};     // name‚Üíreg
  this.localList=[];  // [{name,reg,depth}]
  this.depth=parent?parent.depth+1:0;
  this.freeReg=parent&&parent.proto===proto?parent.freeReg:0;
  this.baseReg=this.freeReg;
  this.upvalues=proto._upvalues||(proto._upvalues=[]);
  this.upvalueMap=proto._upvalueMap||(proto._upvalueMap={});
  this.breakList=parent?parent.breakList:null;
  this.breakCloseReg=parent?parent.breakCloseReg:0;
  this.continueList=parent?parent.continueList:null;
  this.continueTarget=parent?parent.continueTarget:-1;
}
BCScope.prototype.addLocal=function(name){
  var reg=this.freeReg++;
  if(this.freeReg>this.proto.maxstack)this.proto.maxstack=this.freeReg;
  this.locals[name]=reg;
  this.localList.push({name:name,reg:reg,depth:this.depth});
  return reg;
};
BCScope.prototype.allocTemp=function(n){
  var base=this.freeReg;
  this.freeReg+=n||1;
  if(this.freeReg>this.proto.maxstack)this.proto.maxstack=this.freeReg;
  return base;
};
BCScope.prototype.freeTemp=function(base){
  this.freeReg=base;
};
BCScope.prototype.resolveLocal=function(name){
  if(this.locals[name]!==undefined)return{type:'local',reg:this.locals[name]};
  if(this.parent&&this.parent.proto===this.proto)return this.parent.resolveLocal(name);
  return null;
};
BCScope.prototype.resolveUpval=function(name){
  if(this.upvalueMap[name]!==undefined)return{type:'upval',idx:this.upvalueMap[name]};
  // Try to find in parent proto chain
  if(!this.parent)return null;
  // Check parent proto's locals
  var pp=this.parent;
  while(pp&&pp.proto===this.proto)pp=pp.parent;
  if(!pp)return null;
  var pLocal=pp.resolveLocal(name);
  if(pLocal){
    var idx=this.upvalues.length;
    this.upvalues.push({name:name,instack:true,idx:pLocal.reg});
    this.upvalueMap[name]=idx;
    return{type:'upval',idx:idx};
  }
  var pUp=pp.resolveUpval(name);
  if(pUp){
    var idx2=this.upvalues.length;
    this.upvalues.push({name:name,instack:false,idx:pUp.idx});
    this.upvalueMap[name]=idx2;
    return{type:'upval',idx:idx2};
  }
  return null;
};
BCScope.prototype.resolve=function(name){
  var loc=this.resolveLocal(name);
  if(loc)return loc;
  var up=this.resolveUpval(name);
  if(up)return up;
  return{type:'global',name:name};
};

function bcNewProto(){
  return{code:[],k:[],p:[],updescs:[],numparams:0,is_vararg:false,maxstack:2,
    _upvalues:[],_upvalueMap:{},_kmap:{},_krefB:new Set(),_krefC:new Set()};
}
function bcMarkKRef(proto,bIsK,cIsK){
  var pc=proto.code.length-1;
  if(bIsK)proto._krefB.add(pc);
  if(cIsK)proto._krefC.add(pc);
}
function bcAddK(proto,val){
  var key=typeof val==='string'?'s:'+val:typeof val==='number'?'n:'+val:typeof val==='boolean'?'b:'+val:'nil';
  if(proto._kmap[key]!==undefined)return proto._kmap[key];
  var idx=proto.k.length;
  proto.k.push(val);
  proto._kmap[key]=idx;
  return idx;
}
function bcEmit(proto,op,a,b,c){
  proto.code.push(bcEncode(op,a||0,b||0,c||0));
  return proto.code.length-1;
}
function bcEmitBx(proto,op,a,bx){
  proto.code.push(bcEncodeBx(op,a||0,bx||0));
  return proto.code.length-1;
}
function bcEmitsBx(proto,op,a,sbx){
  proto.code.push(bcEncodesBx(op,a||0,sbx||0));
  return proto.code.length-1;
}
function bcPatchsBx(proto,pc,target){
  var sbx=target-pc-1;
  var old=proto.code[pc];
  var op=old&0xFF,a=(old>>8)&0xFF;
  proto.code[pc]=bcEncodeBx(op,a,sbx+32767);
}
function bcRK(proto,scope,expr){
  // Try to encode as constant in RK field (128+idx, max idx=127)
  if(expr.k==='num'){var ki=bcAddK(proto,expr.v);if(ki<=127)return{rk:128+ki,temp:false,isK:true};}
  if(expr.k==='str'){var ki2=bcAddK(proto,expr.v);if(ki2<=127)return{rk:128+ki2,temp:false,isK:true};}
  if(expr.k==='true'){var ki3=bcAddK(proto,true);if(ki3<=127)return{rk:128+ki3,temp:false,isK:true};}
  if(expr.k==='false'){var ki4=bcAddK(proto,false);if(ki4<=127)return{rk:128+ki4,temp:false,isK:true};}
  if(expr.k==='nil'){var ki5=bcAddK(proto,null);if(ki5<=127)return{rk:128+ki5,temp:false,isK:true};}
  // Fall back to loading into temp register
  var t=scope.allocTemp();
  bcCompileExpr(expr,proto,scope,t,false);
  return{rk:t,temp:true,isK:false};
}

// ‚îÄ‚îÄ‚îÄ EXPRESSION COMPILER ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
var _bcBinopMap={'+':BC.ADD,'-':BC.SUB,'*':BC.MUL,'/':BC.DIV,'%':BC.MOD,'^':BC.POW,'//':BC.IDIV,
  '&':BC.BAND,'|':BC.BOR,'~':BC.BXOR,'>>':BC.SHR,'<<':BC.SHL};

function bcCompileExpr(expr,proto,scope,target,wantMulti){
  if(!expr){bcEmit(proto,BC.LOADNIL,target,0);return;}
  switch(expr.k){
  case 'nil':
    bcEmit(proto,BC.LOADNIL,target,0);
    break;
  case 'true':
    bcEmit(proto,BC.LOADBOOL,target,1,0);
    break;
  case 'false':
    bcEmit(proto,BC.LOADBOOL,target,0,0);
    break;
  case 'num':
    bcEmitBx(proto,BC.LOADK,target,bcAddK(proto,expr.v));
    break;
  case 'str':
    bcEmitBx(proto,BC.LOADK,target,bcAddK(proto,expr.v));
    break;
  case 'name':{
    var r=scope.resolve(expr.n);
    if(r.type==='local'){
      if(r.reg!==target)bcEmit(proto,BC.MOVE,target,r.reg);
    }else if(r.type==='upval'){
      bcEmit(proto,BC.GETUPVAL,target,r.idx);
    }else{
      bcEmitBx(proto,BC.GETGLOBAL,target,bcAddK(proto,expr.n));
    }
    break;
  }
  case 'field':{
    var saveReg=scope.freeReg;
    var objR=scope.allocTemp();
    bcCompileExpr(expr.obj,proto,scope,objR,false);
    var fki=bcAddK(proto,expr.f);
    if(fki>127){
      // Load key constant into temp register, then GETTABLE
      var kR=scope.allocTemp();
      bcEmitBx(proto,BC.LOADK,kR,fki);
      bcEmit(proto,BC.GETTABLE,target,objR,kR);
      scope.freeTemp(saveReg);
    }else{
      bcEmit(proto,BC.GETTABLE,target,objR,128+fki);
      bcMarkKRef(proto,false,true);
      scope.freeTemp(saveReg);
    }
    break;
  }
  case 'index':{
    var saveReg2=scope.freeReg;
    var objR2=scope.allocTemp();
    bcCompileExpr(expr.obj,proto,scope,objR2,false);
    var idxRK=bcRK(proto,scope,expr.idx);
    bcEmit(proto,BC.GETTABLE,target,objR2,idxRK.rk);
    bcMarkKRef(proto,false,idxRK.isK);
    scope.freeTemp(saveReg2);
    break;
  }
  case 'binop':{
    if(expr.op==='and'){
      bcCompileExpr(expr.l,proto,scope,target,false);
      bcEmit(proto,BC.TESTSET,target,target,0);
      var jmp=bcEmitsBx(proto,BC.JMP,0,0);
      bcCompileExpr(expr.r,proto,scope,target,wantMulti);
      bcPatchsBx(proto,jmp,proto.code.length);
      break;
    }
    if(expr.op==='or'){
      bcCompileExpr(expr.l,proto,scope,target,false);
      bcEmit(proto,BC.TESTSET,target,target,1);
      var jmp2=bcEmitsBx(proto,BC.JMP,0,0);
      bcCompileExpr(expr.r,proto,scope,target,wantMulti);
      bcPatchsBx(proto,jmp2,proto.code.length);
      break;
    }
    if(expr.op==='..'){
      // CONCAT: put operands in consecutive regs
      var saveR=scope.freeReg;
      // Flatten concat chain
      var parts=[];
      var cur=expr;
      while(cur.k==='binop'&&cur.op==='..'){parts.push(cur.l);cur=cur.r;}
      parts.push(cur);
      var base=scope.allocTemp(parts.length);
      for(var ci=0;ci<parts.length;ci++)bcCompileExpr(parts[ci],proto,scope,base+ci,false);
      bcEmit(proto,BC.CONCAT,target,base,base+parts.length-1);
      scope.freeTemp(saveR);
      break;
    }
    // Comparison ops
    if(expr.op==='<'||expr.op==='>'||expr.op==='<='||expr.op==='>='||expr.op==='=='||expr.op==='~='){
      var saveR3=scope.freeReg;
      var lRK=bcRK(proto,scope,expr.l);
      var rRK=bcRK(proto,scope,expr.r);
      var cmpOp,cmpA,cmpB=lRK.rk,cmpC=rRK.rk;
      if(expr.op==='<'){cmpOp=BC.LT;cmpA=0;}
      else if(expr.op==='>'){cmpOp=BC.LT;cmpA=0;cmpB=rRK.rk;cmpC=lRK.rk;} // a>b == b<a
      else if(expr.op==='<='){cmpOp=BC.LE;cmpA=0;}
      else if(expr.op==='>='){cmpOp=BC.LE;cmpA=0;cmpB=rRK.rk;cmpC=lRK.rk;}
      else if(expr.op==='=='){cmpOp=BC.EQ;cmpA=0;}
      else{cmpOp=BC.EQ;cmpA=1;} // ~= is EQ with A=1 (skip if equal)
      bcEmit(proto,cmpOp,cmpA,cmpB,cmpC);
      var _swp=(expr.op==='>'||expr.op==='>=');
      bcMarkKRef(proto,_swp?rRK.isK:lRK.isK,_swp?lRK.isK:rRK.isK);
      bcEmitsBx(proto,BC.JMP,0,1); // skip next if condition false
      bcEmit(proto,BC.LOADBOOL,target,1,1); // true, skip next
      bcEmit(proto,BC.LOADBOOL,target,0,0); // false
      scope.freeTemp(saveR3);
      break;
    }
    // Arithmetic/bitwise
    var bop=_bcBinopMap[expr.op];
    if(bop!==undefined){
      var saveR4=scope.freeReg;
      var bL=bcRK(proto,scope,expr.l);
      var bR=bcRK(proto,scope,expr.r);
      bcEmit(proto,bop,target,bL.rk,bR.rk);
      bcMarkKRef(proto,bL.isK,bR.isK);
      scope.freeTemp(saveR4);
      break;
    }
    // Fallback: shouldn't happen
    bcEmit(proto,BC.LOADNIL,target,0);
    break;
  }
  case 'unop':{
    var uop=expr.op;
    var saveR5=scope.freeReg;
    var uR=scope.allocTemp();
    bcCompileExpr(expr.e,proto,scope,uR,false);
    if(uop==='-')bcEmit(proto,BC.UNM,target,uR);
    else if(uop==='not')bcEmit(proto,BC.NOT,target,uR);
    else if(uop==='#')bcEmit(proto,BC.LEN,target,uR);
    else if(uop==='~')bcEmit(proto,BC.BNOT,target,uR);
    scope.freeTemp(saveR5);
    break;
  }
  case 'call':{
    var saveR6=scope.freeReg;
    // Ensure func goes to target, args follow
    var base6=target;
    scope.freeReg=Math.max(scope.freeReg,base6+1);
    bcCompileExpr(expr.f,proto,scope,base6,false);
    var nargs=expr.args.length;
    scope.freeReg=base6+1;
    for(var ai=0;ai<nargs;ai++){
      var aReg=scope.allocTemp();
      var isLast=(ai===nargs-1);
      bcCompileExpr(expr.args[ai],proto,scope,aReg,isLast);
    }
    if(scope.freeReg>proto.maxstack)proto.maxstack=scope.freeReg;
    // B: nargs+1, or 0 if last arg is multi-return
    var bArg=nargs+1;
    if(nargs>0&&_bcIsMultiRet(expr.args[nargs-1]))bArg=0;
    var cRet=wantMulti?0:2; // 0=multi-return, 2=1 result
    bcEmit(proto,BC.CALL,base6,bArg,cRet);
    scope.freeTemp(saveR6);
    break;
  }
  case 'callm':{
    var saveR7=scope.freeReg;
    var base7=target;
    scope.freeReg=Math.max(scope.freeReg,base7+2);
    // SELF: R[base7+1]=obj, R[base7]=obj[method]
    var objTemp7=scope.allocTemp();
    bcCompileExpr(expr.obj,proto,scope,objTemp7,false);
    var mki=bcAddK(proto,expr.m);
    if(mki>127){
      var mkR=scope.allocTemp();
      bcEmitBx(proto,BC.LOADK,mkR,mki);
      bcEmit(proto,BC.SELF,base7,objTemp7,mkR);
      // mkR is a register (LOADK target), no K ref
    }else{
      bcEmit(proto,BC.SELF,base7,objTemp7,128+mki);
      bcMarkKRef(proto,false,true);
    }
    // Args start at base7+2
    var nargs7=expr.args.length;
    scope.freeReg=base7+2;
    for(var ai7=0;ai7<nargs7;ai7++){
      var aReg7=scope.allocTemp();
      bcCompileExpr(expr.args[ai7],proto,scope,aReg7,ai7===nargs7-1);
    }
    if(scope.freeReg>proto.maxstack)proto.maxstack=scope.freeReg;
    var bArg7=nargs7+2; // +1 for self
    if(nargs7>0&&_bcIsMultiRet(expr.args[nargs7-1]))bArg7=0;
    bcEmit(proto,BC.CALL,base7,bArg7,wantMulti?0:2);
    scope.freeTemp(saveR7);
    break;
  }
  case 'func':{
    var subProto=bcCompileFunc(expr,proto,scope);
    var pi=proto.p.length;
    proto.p.push(subProto);
    bcEmitBx(proto,BC.CLOSURE,target,pi);
    break;
  }
  case 'tbl':{
    var saveR8=scope.freeReg;
    bcEmit(proto,BC.NEWTABLE,target,0,0);
    var arrIdx=0;
    var pendingArr=[];
    for(var fi=0;fi<expr.fields.length;fi++){
      var fld=expr.fields[fi];
      if(fld.k==='v'){
        // Array-style: accumulate in consecutive regs, flush with SETLIST
        var vR=scope.allocTemp();
        var isLast=(fi===expr.fields.length-1);
        bcCompileExpr(fld.val,proto,scope,vR,isLast);
        pendingArr.push(vR);
        arrIdx++;
        if(pendingArr.length>=50||fi===expr.fields.length-1){
          // Flush with SETLIST
          var flushCount=pendingArr.length;
          if(isLast&&_bcIsMultiRet(fld.val))flushCount=0; // 0 means variable count
          var batch=Math.floor((arrIdx-pendingArr.length)/50)+1;
          bcEmit(proto,BC.SETLIST,target,flushCount,batch);
          pendingArr=[];
          scope.freeReg=target+1; // Reset so next batch starts at target+1
        }
      }else if(fld.k==='kv'){
        // key-value: obj[key]=val
        var kvSave=scope.freeReg;
        var keyRK=bcRK(proto,scope,fld.key);
        var valRK=bcRK(proto,scope,fld.val);
        bcEmit(proto,BC.SETTABLE,target,keyRK.rk,valRK.rk);
        bcMarkKRef(proto,keyRK.isK,valRK.isK);
        scope.freeTemp(kvSave);
      }else if(fld.k==='nv'){
        // named field: obj[name]=val
        var nvSave=scope.freeReg;
        var nki=bcAddK(proto,fld.key);
        var nvValRK=bcRK(proto,scope,fld.val);
        if(nki>127){
          var nkR=scope.allocTemp();
          bcEmitBx(proto,BC.LOADK,nkR,nki);
          bcEmit(proto,BC.SETTABLE,target,nkR,nvValRK.rk);
          bcMarkKRef(proto,false,nvValRK.isK);
        }else{
          bcEmit(proto,BC.SETTABLE,target,128+nki,nvValRK.rk);
          bcMarkKRef(proto,true,nvValRK.isK);
        }
        scope.freeTemp(nvSave);
      }
    }
    // Flush any pending array elements (last field was hash)
    if(pendingArr.length>0){
      var flushCount=pendingArr.length;
      var batch=Math.floor((arrIdx-pendingArr.length)/50)+1;
      bcEmit(proto,BC.SETLIST,target,flushCount,batch);
    }
    scope.freeTemp(saveR8);
    break;
  }
  case 'vararg':
    bcEmit(proto,BC.VARARG,target,wantMulti?0:2);
    break;
  case 'paren':{
    bcCompileExpr(expr.e,proto,scope,target,false); // Force single value
    break;
  }
  case 'ifexpr':{
    // if cond then expr [elseif cond then expr]* else expr
    var ieSave=scope.freeReg;
    var ieCondR=scope.allocTemp();
    bcCompileExpr(expr.cond,proto,scope,ieCondR,false);
    bcEmit(proto,BC.TEST,ieCondR,0,0);
    var ieElseJmp=bcEmitsBx(proto,BC.JMP,0,0);
    scope.freeTemp(ieSave);
    bcCompileExpr(expr.then_,proto,scope,target,false);
    var ieEndJmps=[];
    ieEndJmps.push(bcEmitsBx(proto,BC.JMP,0,0));
    bcPatchsBx(proto,ieElseJmp,proto.code.length);
    for(var iei=0;iei<expr.elseifs.length;iei++){
      var eif=expr.elseifs[iei];
      var eiSv=scope.freeReg;
      var eiCR=scope.allocTemp();
      bcCompileExpr(eif.cond,proto,scope,eiCR,false);
      bcEmit(proto,BC.TEST,eiCR,0,0);
      var eiEJ=bcEmitsBx(proto,BC.JMP,0,0);
      scope.freeTemp(eiSv);
      bcCompileExpr(eif.val,proto,scope,target,false);
      ieEndJmps.push(bcEmitsBx(proto,BC.JMP,0,0));
      bcPatchsBx(proto,eiEJ,proto.code.length);
    }
    bcCompileExpr(expr.else_,proto,scope,target,false);
    for(var iej=0;iej<ieEndJmps.length;iej++) bcPatchsBx(proto,ieEndJmps[iej],proto.code.length);
    break;
  }
  default:
    bcEmit(proto,BC.LOADNIL,target,0);
  }
}

function _bcIsMultiRet(expr){
  return expr&&(expr.k==='call'||expr.k==='callm'||expr.k==='vararg');
}

// ‚îÄ‚îÄ‚îÄ STATEMENT COMPILER ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
function bcCompileStmt(stmt,proto,scope){
  if(!stmt)return;
  switch(stmt.k){
  case 'local':{
    // Evaluate RHS values
    var nNames=stmt.names.length;
    var nVals=stmt.vals.length;
    var saveReg=scope.freeReg;
    // Allocate temp space for values
    var valBase=scope.freeReg;
    for(var vi=0;vi<nVals;vi++){
      var vReg=scope.allocTemp();
      var isLast=(vi===nVals-1);
      var wantM=isLast&&nNames>nVals;
      bcCompileExpr(stmt.vals[vi],proto,scope,vReg,wantM);
    }
    scope.freeTemp(saveReg);
    // Now register locals and move values
    var _lastMultiLocal=nVals>0&&_bcIsMultiRet(stmt.vals[nVals-1])&&nNames>nVals;
    for(var ni=0;ni<nNames;ni++){
      var reg=scope.addLocal(stmt.names[ni]);
      if(ni<nVals){
        if(valBase+ni!==reg)bcEmit(proto,BC.MOVE,reg,valBase+ni);
      }else if(_lastMultiLocal){
        // Multi-return CALL already filled this register; just move if needed
        if(valBase+ni!==reg)bcEmit(proto,BC.MOVE,reg,valBase+ni);
      }else{
        bcEmit(proto,BC.LOADNIL,reg,0);
      }
    }
    break;
  }
  case 'assign':{
    var nTgts=stmt.targets.length;
    var nValsA=stmt.vals.length;
    var saveRegA=scope.freeReg;
    // Eval all RHS into temps
    var valBaseA=scope.allocTemp(Math.max(nTgts,nValsA));
    scope.freeTemp(saveRegA);
    scope.freeReg=saveRegA;
    for(var via=0;via<nValsA;via++){
      var vRegA=saveRegA+via;
      scope.freeReg=vRegA+1;
      if(scope.freeReg>proto.maxstack)proto.maxstack=scope.freeReg;
      var isLastA=(via===nValsA-1);
      bcCompileExpr(stmt.vals[via],proto,scope,vRegA,isLastA&&nTgts>nValsA);
    }
    scope.freeReg=saveRegA+Math.max(nTgts,nValsA);
    if(scope.freeReg>proto.maxstack)proto.maxstack=scope.freeReg;
    // Assign to targets
    var _lastMultiAssign=nValsA>0&&_bcIsMultiRet(stmt.vals[nValsA-1])&&nTgts>nValsA;
    for(var ti=0;ti<nTgts;ti++){
      var tgt=stmt.targets[ti];
      var srcReg=saveRegA+ti;
      if(ti>=nValsA&&!_lastMultiAssign){
        bcEmit(proto,BC.LOADNIL,srcReg,0);
      }
      if(tgt.k==='name'){
        var rr=scope.resolve(tgt.n);
        if(rr.type==='local'){
          if(rr.reg!==srcReg)bcEmit(proto,BC.MOVE,rr.reg,srcReg);
        }else if(rr.type==='upval'){
          bcEmit(proto,BC.SETUPVAL,srcReg,rr.idx);
        }else{
          bcEmitBx(proto,BC.SETGLOBAL,srcReg,bcAddK(proto,tgt.n));
        }
      }else if(tgt.k==='field'){
        var objSave=scope.freeReg;
        var objR=scope.allocTemp();
        bcCompileExpr(tgt.obj,proto,scope,objR,false);
        var fkiA=bcAddK(proto,tgt.f);
        if(fkiA>127){
          var fkR=scope.allocTemp();
          bcEmitBx(proto,BC.LOADK,fkR,fkiA);
          bcEmit(proto,BC.SETTABLE,objR,fkR,srcReg);
          // fkR is register (LOADK target), no K ref
        }else{
          bcEmit(proto,BC.SETTABLE,objR,128+fkiA,srcReg);
          bcMarkKRef(proto,true,false);
        }
        scope.freeTemp(objSave);
      }else if(tgt.k==='index'){
        var idxSave=scope.freeReg;
        var objR2=scope.allocTemp();
        bcCompileExpr(tgt.obj,proto,scope,objR2,false);
        var idxRK2=bcRK(proto,scope,tgt.idx);
        bcEmit(proto,BC.SETTABLE,objR2,idxRK2.rk,srcReg);
        bcMarkKRef(proto,idxRK2.isK,false);
        scope.freeTemp(idxSave);
      }
    }
    scope.freeTemp(saveRegA);
    break;
  }
  case 'compassign':{
    // Compound assignment for field/index targets.
    // Evaluates obj (and idx) once, reads current value, applies binop, writes back.
    var caSave=scope.freeReg;
    var tgt=stmt.target;
    if(tgt.k==='field'){
      var caObjR=scope.allocTemp();
      bcCompileExpr(tgt.obj,proto,scope,caObjR,false);
      var caFki=bcAddK(proto,tgt.f);
      // Read current value into valR
      var caValR=scope.allocTemp();
      if(caFki>127){
        var caFkR=scope.allocTemp();
        bcEmitBx(proto,BC.LOADK,caFkR,caFki);
        bcEmit(proto,BC.GETTABLE,caValR,caObjR,caFkR);
      }else{
        bcEmit(proto,BC.GETTABLE,caValR,caObjR,128+caFki);
        bcMarkKRef(proto,false,true);
      }
      // Compile RHS and apply binop
      var caRhsRK=bcRK(proto,scope,stmt.rhs);
      var caBop=_bcBinopMap[stmt.op];
      if(stmt.op==='..'){
        // CONCAT needs consecutive regs
        var caCBase=scope.freeReg;
        var caCR0=scope.allocTemp();
        var caCR1=scope.allocTemp();
        bcEmit(proto,BC.MOVE,caCR0,caValR);
        bcCompileExpr(stmt.rhs,proto,scope,caCR1,false);
        bcEmit(proto,BC.CONCAT,caValR,caCR0,caCR1);
      }else if(caBop!==undefined){
        bcEmit(proto,caBop,caValR,caValR,caRhsRK.rk);
        bcMarkKRef(proto,false,caRhsRK.isK);
      }
      // Write back using same obj register
      if(caFki>127){
        bcEmit(proto,BC.SETTABLE,caObjR,caFki>127?scope.freeReg-1:0,caValR);
      }else{
        bcEmit(proto,BC.SETTABLE,caObjR,128+caFki,caValR);
        bcMarkKRef(proto,true,false);
      }
    }else if(tgt.k==='index'){
      var caObjR2=scope.allocTemp();
      bcCompileExpr(tgt.obj,proto,scope,caObjR2,false);
      var caIdxR=scope.allocTemp();
      bcCompileExpr(tgt.idx,proto,scope,caIdxR,false);
      // Read current value
      var caValR2=scope.allocTemp();
      bcEmit(proto,BC.GETTABLE,caValR2,caObjR2,caIdxR);
      bcMarkKRef(proto,false,false);
      // Compile RHS and apply binop
      var caRhsRK2=bcRK(proto,scope,stmt.rhs);
      var caBop2=_bcBinopMap[stmt.op];
      if(stmt.op==='..'){
        var caCBase2=scope.freeReg;
        var caCR02=scope.allocTemp();
        var caCR12=scope.allocTemp();
        bcEmit(proto,BC.MOVE,caCR02,caValR2);
        bcCompileExpr(stmt.rhs,proto,scope,caCR12,false);
        bcEmit(proto,BC.CONCAT,caValR2,caCR02,caCR12);
      }else if(caBop2!==undefined){
        bcEmit(proto,caBop2,caValR2,caValR2,caRhsRK2.rk);
        bcMarkKRef(proto,false,caRhsRK2.isK);
      }
      // Write back using same obj and idx registers
      bcEmit(proto,BC.SETTABLE,caObjR2,caIdxR,caValR2);
      bcMarkKRef(proto,false,false);
    }
    scope.freeTemp(caSave);
    break;
  }
  case 'callstat':{
    var saveCS=scope.freeReg;
    var csReg=scope.allocTemp();
    bcCompileExpr(stmt.e,proto,scope,csReg,false);
    scope.freeTemp(saveCS);
    break;
  }
  case 'do':{
    var childScope=new BCScope(scope,proto);
    bcCompileBlock(stmt.body,proto,childScope);
    bcEmit(proto,BC.CLOSE,childScope.baseReg,0);
    scope.freeReg=childScope.baseReg;
    break;
  }
  case 'if':{
    // if cond then ... elseif ... else ... end
    var endJumps=[];
    // Main if
    var saveFR=scope.freeReg;
    var condR=scope.allocTemp();
    bcCompileExpr(stmt.cond,proto,scope,condR,false);
    bcEmit(proto,BC.TEST,condR,0,0); // skip if truthy
    var elseJmp=bcEmitsBx(proto,BC.JMP,0,0);
    scope.freeTemp(saveFR);
    // Then block
    var thenScope=new BCScope(scope,proto);
    bcCompileBlock(stmt.then,proto,thenScope);
    bcEmit(proto,BC.CLOSE,thenScope.baseReg,0);
    scope.freeReg=thenScope.baseReg;
    if(stmt.elseifs.length>0||stmt.else_){
      endJumps.push(bcEmitsBx(proto,BC.JMP,0,0));
    }
    bcPatchsBx(proto,elseJmp,proto.code.length);
    // Elseifs
    for(var eii=0;eii<stmt.elseifs.length;eii++){
      var ei=stmt.elseifs[eii];
      var eiSave=scope.freeReg;
      var eiCondR=scope.allocTemp();
      bcCompileExpr(ei.cond,proto,scope,eiCondR,false);
      bcEmit(proto,BC.TEST,eiCondR,0,0);
      var eiElseJmp=bcEmitsBx(proto,BC.JMP,0,0);
      scope.freeTemp(eiSave);
      var eiScope=new BCScope(scope,proto);
      bcCompileBlock(ei.body,proto,eiScope);
      bcEmit(proto,BC.CLOSE,eiScope.baseReg,0);
      scope.freeReg=eiScope.baseReg;
      if(eii<stmt.elseifs.length-1||stmt.else_){
        endJumps.push(bcEmitsBx(proto,BC.JMP,0,0));
      }
      bcPatchsBx(proto,eiElseJmp,proto.code.length);
    }
    // Else
    if(stmt.else_){
      var elseScope=new BCScope(scope,proto);
      bcCompileBlock(stmt.else_,proto,elseScope);
      bcEmit(proto,BC.CLOSE,elseScope.baseReg,0);
      scope.freeReg=elseScope.baseReg;
    }
    // Patch end jumps
    for(var ej=0;ej<endJumps.length;ej++)bcPatchsBx(proto,endJumps[ej],proto.code.length);
    break;
  }
  case 'while':{
    var loopTop=proto.code.length;
    var saveFRW=scope.freeReg;
    var wCondR=scope.allocTemp();
    bcCompileExpr(stmt.cond,proto,scope,wCondR,false);
    bcEmit(proto,BC.TEST,wCondR,0,0);
    var wExitJmp=bcEmitsBx(proto,BC.JMP,0,0);
    scope.freeTemp(saveFRW);
    var wScope=new BCScope(scope,proto);
    wScope.breakList=[];
    wScope.breakCloseReg=wScope.baseReg;
    wScope.continueList=[];
    wScope.continueTarget=loopTop;
    bcCompileBlock(stmt.body,proto,wScope);
    // CLOSE at end of body (before backward JMP)
    var wClosePos=proto.code.length;
    bcEmit(proto,BC.CLOSE,wScope.baseReg,0);
    scope.freeReg=wScope.baseReg;
    // Patch continues to CLOSE (then falls through to backward JMP)
    for(var wci=0;wci<wScope.continueList.length;wci++)bcPatchsBx(proto,wScope.continueList[wci],wClosePos);
    bcEmitsBx(proto,BC.JMP,0,loopTop-proto.code.length-1);
    // CLOSE for exit/break paths
    bcEmit(proto,BC.CLOSE,wScope.baseReg,0);
    bcPatchsBx(proto,wExitJmp,proto.code.length-1);
    // Patch breaks to exit CLOSE
    for(var wbi=0;wbi<wScope.breakList.length;wbi++)bcPatchsBx(proto,wScope.breakList[wbi],proto.code.length-1);
    break;
  }
  case 'repeat':{
    var repTop=proto.code.length;
    var repScope=new BCScope(scope,proto);
    repScope.breakList=[];
    repScope.breakCloseReg=repScope.baseReg;
    repScope.continueList=[];
    repScope.continueTarget=repTop;
    bcCompileBlock(stmt.body,proto,repScope);
    // Patch continues before condition check
    for(var rci=0;rci<repScope.continueList.length;rci++)bcPatchsBx(proto,repScope.continueList[rci],proto.code.length);
    // Condition evaluated in body scope (repeat..until sees body locals)
    var repCondR=repScope.allocTemp();
    bcCompileExpr(stmt.cond,proto,repScope,repCondR,false);
    bcEmit(proto,BC.TEST,repCondR,0,0); // skip JMP if truthy (exit loop)
    bcEmitsBx(proto,BC.JMP,0,repTop-proto.code.length-1); // loop back
    scope.freeReg=repScope.baseReg;
    // CLOSE for exit/break paths
    bcEmit(proto,BC.CLOSE,repScope.baseReg,0);
    // Patch breaks to CLOSE
    for(var rbi=0;rbi<repScope.breakList.length;rbi++)bcPatchsBx(proto,repScope.breakList[rbi],proto.code.length-1);
    break;
  }
  case 'numfor':{
    // R[base]=start, R[base+1]=limit, R[base+2]=step, R[base+3]=var
    var nfBase=scope.freeReg;
    scope.allocTemp(4); // Reserve 4 regs
    bcCompileExpr(stmt.start,proto,scope,nfBase,false);
    bcCompileExpr(stmt.limit,proto,scope,nfBase+1,false);
    if(stmt.step){
      bcCompileExpr(stmt.step,proto,scope,nfBase+2,false);
    }else{
      bcEmitBx(proto,BC.LOADK,nfBase+2,bcAddK(proto,1));
    }
    var forprepJmp=bcEmitsBx(proto,BC.FORPREP,nfBase,0);
    var bodyTop=proto.code.length;
    var nfScope=new BCScope(scope,proto);
    nfScope.locals[stmt.name]=nfBase+3;
    nfScope.localList.push({name:stmt.name,reg:nfBase+3,depth:nfScope.depth});
    nfScope.breakList=[];
    nfScope.breakCloseReg=nfBase;
    nfScope.continueList=[];
    bcCompileBlock(stmt.body,proto,nfScope);
    // CLOSE at end of body
    var nfClosePos=proto.code.length;
    bcEmit(proto,BC.CLOSE,nfBase,0);
    // Patch continues to CLOSE (then falls through to FORLOOP)
    for(var nci=0;nci<nfScope.continueList.length;nci++)bcPatchsBx(proto,nfScope.continueList[nci],nfClosePos);
    var forloopPC=bcEmitsBx(proto,BC.FORLOOP,nfBase,bodyTop-proto.code.length-1);
    bcPatchsBx(proto,forprepJmp,forloopPC); // FORPREP jumps to FORLOOP
    // CLOSE for exit/break paths
    bcEmit(proto,BC.CLOSE,nfBase,0);
    // Patch breaks to exit CLOSE
    for(var nbi=0;nbi<nfScope.breakList.length;nbi++)bcPatchsBx(proto,nfScope.breakList[nbi],proto.code.length-1);
    scope.freeReg=nfBase;
    break;
  }
  case 'genfor':{
    // R[base]=iter, R[base+1]=state, R[base+2]=control, R[base+3..]=vars
    var gfBase=scope.freeReg;
    var nvars=stmt.names.length;
    scope.allocTemp(3+nvars);
    // Pre-fill all 3 iterator slots with nil (before expression eval)
    for(var gf=0;gf<3;gf++)bcEmit(proto,BC.LOADNIL,gfBase+gf,0);
    // Eval iterator expressions (max 3) ‚Äî multi-return CALL overwrites pre-filled nils
    var niters=stmt.iters.length;
    for(var gi=0;gi<niters&&gi<3;gi++){
      bcCompileExpr(stmt.iters[gi],proto,scope,gfBase+gi,gi===niters-1&&gi<2);
    }
    var gfJmp=bcEmitsBx(proto,BC.JMP,0,0); // Jump to TFORCALL
    var gfBodyTop=proto.code.length;
    var gfScope=new BCScope(scope,proto);
    for(var gni=0;gni<nvars;gni++){
      gfScope.locals[stmt.names[gni]]=gfBase+3+gni;
      gfScope.localList.push({name:stmt.names[gni],reg:gfBase+3+gni,depth:gfScope.depth});
    }
    gfScope.breakList=[];
    gfScope.breakCloseReg=gfBase;
    gfScope.continueList=[];
    bcCompileBlock(stmt.body,proto,gfScope);
    // CLOSE at end of body (before TFORCALL)
    var gfClosePos=proto.code.length;
    bcEmit(proto,BC.CLOSE,gfBase,0);
    // Patch continues to CLOSE (then falls through to TFORCALL)
    for(var gci=0;gci<gfScope.continueList.length;gci++)bcPatchsBx(proto,gfScope.continueList[gci],gfClosePos);
    bcPatchsBx(proto,gfJmp,proto.code.length); // first-time JMP ‚Üí TFORCALL
    bcEmit(proto,BC.TFORCALL,gfBase,0,nvars);
    bcEmitsBx(proto,BC.TFORLOOP,gfBase+2,gfBodyTop-proto.code.length-1);
    // CLOSE for exit/break paths
    bcEmit(proto,BC.CLOSE,gfBase,0);
    // Patch breaks to exit CLOSE
    for(var gbi=0;gbi<gfScope.breakList.length;gbi++)bcPatchsBx(proto,gfScope.breakList[gbi],proto.code.length-1);
    scope.freeReg=gfBase;
    break;
  }
  case 'return':{
    var nRets=stmt.vals.length;
    if(nRets===0){
      bcEmit(proto,BC.RETURN,0,1);
    }else{
      var retBase=scope.freeReg;
      for(var ri=0;ri<nRets;ri++){
        var rReg=scope.allocTemp();
        bcCompileExpr(stmt.vals[ri],proto,scope,rReg,ri===nRets-1);
      }
      var bRet=nRets+1;
      if(_bcIsMultiRet(stmt.vals[nRets-1]))bRet=0;
      bcEmit(proto,BC.RETURN,retBase,bRet);
      scope.freeTemp(retBase);
    }
    break;
  }
  case 'break':{
    if(scope.breakList){
      bcEmit(proto,BC.CLOSE,scope.breakCloseReg,0);
      scope.breakList.push(bcEmitsBx(proto,BC.JMP,0,0));
    }
    break;
  }
  case 'continue':{
    if(scope.continueList){
      bcEmit(proto,BC.CLOSE,scope.breakCloseReg,0);
      scope.continueList.push(bcEmitsBx(proto,BC.JMP,0,0));
    }
    break;
  }
  case 'label':{
    // Labels tracked separately for goto resolution
    if(!proto._labels)proto._labels={};
    proto._labels[stmt.name]=proto.code.length;
    // Resolve pending gotos
    if(proto._gotos&&proto._gotos[stmt.name]){
      var pending=proto._gotos[stmt.name];
      for(var li=0;li<pending.length;li++)bcPatchsBx(proto,pending[li],proto.code.length);
      delete proto._gotos[stmt.name];
    }
    break;
  }
  case 'goto':{
    if(proto._labels&&proto._labels[stmt.name]!==undefined){
      bcEmitsBx(proto,BC.JMP,0,proto._labels[stmt.name]-proto.code.length-1);
    }else{
      if(!proto._gotos)proto._gotos={};
      if(!proto._gotos[stmt.name])proto._gotos[stmt.name]=[];
      proto._gotos[stmt.name].push(bcEmitsBx(proto,BC.JMP,0,0));
    }
    break;
  }
  case 'funcdef':{
    var fdSave=scope.freeReg;
    var fdFuncReg=scope.allocTemp();
    var fdSubProto=bcCompileFunc(stmt.func,proto,scope);
    var fdPi=proto.p.length;
    proto.p.push(fdSubProto);
    bcEmitBx(proto,BC.CLOSURE,fdFuncReg,fdPi);
    // Assign to target
    var fdTgt=stmt.target;
    if(fdTgt.k==='name'){
      var fdR=scope.resolve(fdTgt.n);
      if(fdR.type==='local')bcEmit(proto,BC.MOVE,fdR.reg,fdFuncReg);
      else if(fdR.type==='upval')bcEmit(proto,BC.SETUPVAL,fdFuncReg,fdR.idx);
      else bcEmitBx(proto,BC.SETGLOBAL,fdFuncReg,bcAddK(proto,fdTgt.n));
    }else if(fdTgt.k==='field'){
      var fdObjR=scope.allocTemp();
      bcCompileExpr(fdTgt.obj,proto,scope,fdObjR,false);
      var fdFKI=bcAddK(proto,fdTgt.f);
      if(fdFKI>127){var fdFKR=scope.allocTemp();bcEmitBx(proto,BC.LOADK,fdFKR,fdFKI);
        bcEmit(proto,BC.SETTABLE,fdObjR,fdFKR,fdFuncReg);
      }else{bcEmit(proto,BC.SETTABLE,fdObjR,128+fdFKI,fdFuncReg);
        bcMarkKRef(proto,true,false);}
    }
    scope.freeTemp(fdSave);
    break;
  }
  case 'localfunc':{
    // Declare local first (for self-recursion)
    var lfReg=scope.addLocal(stmt.name);
    var lfSubProto=bcCompileFunc(stmt.func,proto,scope);
    var lfPi=proto.p.length;
    proto.p.push(lfSubProto);
    bcEmitBx(proto,BC.CLOSURE,lfReg,lfPi);
    break;
  }
  default: break;
  }
}

function bcCompileBlock(block,proto,scope){
  if(!block||!block.body)return;
  for(var i=0;i<block.body.length;i++){
    bcCompileStmt(block.body[i],proto,scope);
  }
}

function bcCompileFunc(funcNode,parentProto,parentScope){
  var proto=bcNewProto();
  proto.numparams=funcNode.params.length;
  proto.is_vararg=!!funcNode.vararg;
  var scope=new BCScope(parentScope,proto);
  // Register params as locals
  for(var pi=0;pi<funcNode.params.length;pi++){
    scope.addLocal(funcNode.params[pi]);
  }
  bcCompileBlock(funcNode.body,proto,scope);
  // Implicit return at end
  bcEmit(proto,BC.RETURN,0,1);
  proto.updescs=proto._upvalues.map(function(u){return{instack:u.instack,idx:u.idx};});
  return proto;
}

function bcCompileTopLevel(ast){
  var proto=bcNewProto();
  proto.is_vararg=true;
  var scope=new BCScope(null,proto);
  bcCompileBlock(ast,proto,scope);
  bcEmit(proto,BC.RETURN,0,1);
  proto.updescs=proto._upvalues.map(function(u){return{instack:u.instack,idx:u.idx};});
  return proto;
}

// ‚îÄ‚îÄ‚îÄ RK Encoding Fixup ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Fixes RK threshold collision: functions with maxstack>128 have register indices
// that collide with K-constant inline encoding (128+ki). Re-encodes K refs to use
// maxstack as threshold, inserts LOADK for overflow cases (maxstack+ki>255).
function fixRKEncoding(proto){
  for(var i=0;i<proto.p.length;i++)fixRKEncoding(proto.p[i]);
  if(proto.maxstack<=128){
    proto.rkThreshold=128;
    return;
  }
  var threshold=proto.maxstack;
  // Check if any K refs overflow at this threshold
  var hasOverflow=false;
  for(var pc=0;pc<proto.code.length;pc++){
    var inst=proto.code[pc];
    var b=(inst>>16)&0xFF,c=(inst>>>24)&0xFF;
    if(proto._krefB.has(pc)&&threshold+(b-128)>255){hasOverflow=true;break;}
    if(proto._krefC.has(pc)&&threshold+(c-128)>255){hasOverflow=true;break;}
  }
  if(!hasOverflow){
    // Simple case: re-encode K refs in-place (no instruction insertion needed)
    proto.rkThreshold=threshold;
    for(var pc=0;pc<proto.code.length;pc++){
      if(!proto._krefB.has(pc)&&!proto._krefC.has(pc))continue;
      var inst=proto.code[pc];
      var op=inst&0xFF,a=(inst>>8)&0xFF,b=(inst>>16)&0xFF,c=(inst>>>24)&0xFF;
      if(proto._krefB.has(pc))b=threshold+(b-128);
      if(proto._krefC.has(pc))c=threshold+(c-128);
      proto.code[pc]=(op&0xFF)|((a&0xFF)<<8)|((b&0xFF)<<16)|((c&0xFF)<<24);
    }
    return;
  }
  // Overflow case: reserve 2 temp registers for LOADK spill
  var tempB=proto.maxstack;
  var tempC=proto.maxstack+1;
  threshold=proto.maxstack+2;
  proto.maxstack=threshold;
  proto.rkThreshold=threshold;
  var maxInlineK=255-threshold;
  // Re-encode instructions and collect LOADK insertions
  var insertions=[];
  for(var pc=0;pc<proto.code.length;pc++){
    if(!proto._krefB.has(pc)&&!proto._krefC.has(pc))continue;
    var inst=proto.code[pc];
    var op=inst&0xFF,a=(inst>>8)&0xFF,b=(inst>>16)&0xFF,c=(inst>>>24)&0xFF;
    var prepend=[];
    if(proto._krefB.has(pc)){
      var ki=b-128;
      if(ki<=maxInlineK){b=threshold+ki;}
      else{prepend.push(bcEncodeBx(BC.LOADK,tempB,ki));b=tempB;}
    }
    if(proto._krefC.has(pc)){
      var ki2=c-128;
      if(ki2<=maxInlineK){c=threshold+ki2;}
      else{var reg=prepend.length>0?tempC:tempB;prepend.push(bcEncodeBx(BC.LOADK,reg,ki2));c=reg;}
    }
    proto.code[pc]=(op&0xFF)|((a&0xFF)<<8)|((b&0xFF)<<16)|((c&0xFF)<<24);
    if(prepend.length>0)insertions.push({pos:pc,instrs:prepend});
  }
  if(insertions.length===0)return;
  // Fix jump targets and rebuild code (same approach as injectGarbage)
  var codeLen=proto.code.length;
  insertions.sort(function(a,b){return a.pos-b.pos;});
  var totalInserted=[];
  var cumulative=0;
  var insIdx=0;
  for(var pc=0;pc<=codeLen;pc++){
    while(insIdx<insertions.length&&insertions[insIdx].pos===pc){
      cumulative+=insertions[insIdx].instrs.length;
      insIdx++;
    }
    totalInserted[pc]=cumulative;
  }
  function newPC(oldPC){return oldPC+(totalInserted[oldPC]||0);}
  var jumpOps=[BC.JMP,BC.FORLOOP,BC.FORPREP,BC.TFORLOOP];
  for(var pc=0;pc<codeLen;pc++){
    var inst=proto.code[pc];
    var op=inst&0xFF;
    for(var ji=0;ji<jumpOps.length;ji++){
      if(op===jumpOps[ji]){
        var a=(inst>>8)&0xFF;
        var sbx=((inst>>16)&0xFFFF)-32767;
        var oldTarget=pc+1+sbx;
        var newSbx=newPC(oldTarget)-newPC(pc)-1;
        proto.code[pc]=bcEncodesBx(op,a,newSbx);
        break;
      }
    }
  }
  var newCode=[];
  insIdx=0;
  for(var pc=0;pc<codeLen;pc++){
    while(insIdx<insertions.length&&insertions[insIdx].pos===pc){
      for(var gi=0;gi<insertions[insIdx].instrs.length;gi++){
        newCode.push(insertions[insIdx].instrs[gi]);
      }
      insIdx++;
    }
    newCode.push(proto.code[pc]);
  }
  proto.code=newCode;
}

// ‚îÄ‚îÄ‚îÄ Layer 38 : Instruction Fusion (Superoperators) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Fuses MOVE+RETURN ‚Üí SUPER_MRET, LOADK+RETURN ‚Üí SUPER_KRET, GETGLOBAL+CALL ‚Üí SUPER_GCALL (2-word)
function fuseInstructions(proto){
  for(var i=0;i<proto.p.length;i++) fuseInstructions(proto.p[i]);
  var code=proto.code;
  var len=code.length;
  if(len<2) return;
  // Build protected set: skip-next positions + jump targets
  var protectedFuse=new Set();
  var jumpTargetOnly=new Set(); // Layer 55: separate set for external jump targets only
  var jumpOps=[BC.JMP,BC.FORLOOP,BC.FORPREP,BC.TFORLOOP];
  for(var pc=0;pc<len;pc++){
    var inst=code[pc];
    var op=inst&0xFF;
    if(op===BC.EQ||op===BC.LT||op===BC.LE||op===BC.TEST||op===BC.TESTSET){
      protectedFuse.add(pc);protectedFuse.add(pc+1);
    }
    if(op===BC.LOADBOOL&&((inst>>24)&0xFF)!==0){
      protectedFuse.add(pc);protectedFuse.add(pc+1);
    }
    // Mark jump targets as protected so we never fuse away a target
    for(var ji=0;ji<jumpOps.length;ji++){
      if(op===jumpOps[ji]){
        var sbx=((inst>>16)&0xFFFF)-32767;
        var target=pc+1+sbx;
        if(target>=0&&target<=len){protectedFuse.add(target);jumpTargetOnly.add(target);}
        break;
      }
    }
  }
  // First pass: determine which pairs can be fused
  var fuseAt=new Set();
  var pc=0;
  while(pc<len){
    // Layer 55: TEST+JMP ‚Äî bypass TEST's self-protection but NOT if JMP is an external jump target
    if(pc+1<len&&!jumpTargetOnly.has(pc+1)){
      var _ti=code[pc],_ti2=code[pc+1];
      if((_ti&0xFF)===BC.TEST&&(_ti2&0xFF)===BC.JMP){fuseAt.add(pc);pc+=2;continue;}
    }
    if(protectedFuse.has(pc)){pc++;continue;}
    if(pc+1<len&&!protectedFuse.has(pc+1)){
      var inst=code[pc],inst2=code[pc+1];
      var op=inst&0xFF,op2=inst2&0xFF;
      var a=(inst>>8)&0xFF,a2=(inst2>>8)&0xFF;
      if(op===BC.MOVE&&op2===BC.RETURN&&a2===a&&((inst2>>16)&0xFF)===2){fuseAt.add(pc);pc+=2;continue;}
      if(op===BC.LOADK&&op2===BC.RETURN&&a2===a&&((inst2>>16)&0xFF)===2){fuseAt.add(pc);pc+=2;continue;}
      if(op===BC.GETGLOBAL&&op2===BC.CALL&&a2===a){fuseAt.add(pc);pc+=2;continue;}
      if(op===BC.SELF&&op2===BC.CALL&&a2===a){fuseAt.add(pc);pc+=2;continue;}
      if(op===BC.GETTABLE&&op2===BC.CALL&&a2===a){fuseAt.add(pc);pc+=2;continue;}
    }
    pc++;
  }
  if(fuseAt.size===0) return;
  // Diagnostic: count fusions by type
  var _fuseCounts={MRET:0,KRET:0,GCALL:0,SELF_CALL:0,TEST_JMP:0,GETTAB_CALL:0};
  fuseAt.forEach(function(fpc){var fop=code[fpc]&0xFF;
    if(fop===BC.MOVE)_fuseCounts.MRET++;
    else if(fop===BC.LOADK)_fuseCounts.KRET++;
    else if(fop===BC.GETGLOBAL)_fuseCounts.GCALL++;
    else if(fop===BC.SELF)_fuseCounts.SELF_CALL++;
    else if(fop===BC.TEST)_fuseCounts.TEST_JMP++;
    else if(fop===BC.GETTABLE)_fuseCounts.GETTAB_CALL++;
  });
  console.log('  fuseInstructions: '+JSON.stringify(_fuseCounts)+' ('+fuseAt.size+' total)');
  // Build old‚Üínew PC mapping
  var oldToNew=new Array(len+1);
  var newPc=0;
  pc=0;
  while(pc<len){
    oldToNew[pc]=newPc;
    if(fuseAt.has(pc)){
      var op=(code[pc]&0xFF);
      if(op===BC.GETGLOBAL||op===BC.SELF||op===BC.TEST||op===BC.GETTABLE) newPc+=2; else newPc+=1;
      oldToNew[pc+1]=newPc; // second instruction maps to after the fused output
      pc+=2;
    }else{
      newPc++;pc++;
    }
  }
  oldToNew[len]=newPc;
  // Build new code with fused instructions
  var newCode=[];
  pc=0;
  while(pc<len){
    if(fuseAt.has(pc)){
      var inst=code[pc],inst2=code[pc+1];
      var op=inst&0xFF;
      var a=(inst>>8)&0xFF;
      if(op===BC.MOVE){
        newCode.push(bcEncode(BC.SUPER_MRET,a,(inst>>16)&0xFF,0));
      }else if(op===BC.LOADK){
        var bx=(inst>>16)&0xFFFF;
        newCode.push(bcEncode(BC.SUPER_KRET,a,bx&0xFF,(bx>>8)&0xFF));
      }else if(op===BC.GETGLOBAL){ // GETGLOBAL+CALL
        var bx2=(inst>>16)&0xFFFF;
        newCode.push(bcEncode(BC.SUPER_GCALL,a,(inst2>>16)&0xFF,(inst2>>24)&0xFF));
        newCode.push(bcEncode(0,0,bx2&0xFF,(bx2>>8)&0xFF));
      }else if(op===BC.SELF){ // SELF+CALL
        newCode.push(bcEncode(BC.SUPER_SELF_CALL,a,(inst2>>16)&0xFF,(inst2>>24)&0xFF));
        newCode.push(bcEncode(0,0,(inst>>16)&0xFF,(inst>>24)&0xFF));
      }else if(op===BC.TEST){ // TEST+JMP
        var jmpSbx=((inst2>>16)&0xFFFF)-32767;
        var jmpOldTarget=pc+2+jmpSbx;
        var jmpNewTarget=oldToNew[jmpOldTarget];
        var newSbx=jmpNewTarget-(oldToNew[pc]+2);
        newCode.push(bcEncode(BC.SUPER_TEST_JMP,a,(inst>>24)&0xFF,0));
        newCode.push(bcEncodesBx(0,0,newSbx));
      }else if(op===BC.GETTABLE){ // GETTABLE+CALL
        newCode.push(bcEncode(BC.SUPER_GETTAB_CALL,a,(inst2>>16)&0xFF,(inst2>>24)&0xFF));
        newCode.push(bcEncode(0,0,(inst>>16)&0xFF,(inst>>24)&0xFF));
      }
      pc+=2;
    }else{
      var inst=code[pc];
      var op=inst&0xFF;
      // Fix jump targets
      for(var ji=0;ji<jumpOps.length;ji++){
        if(op===jumpOps[ji]){
          var a=(inst>>8)&0xFF;
          var sbx=((inst>>16)&0xFFFF)-32767;
          var oldTarget=pc+1+sbx;
          var newSbx=oldToNew[oldTarget]-(oldToNew[pc]+1);
          newCode.push(bcEncodesBx(op,a,newSbx));
          op=-1; break;
        }
      }
      if(op!==-1) newCode.push(inst);
      pc++;
    }
  }
  proto.code=newCode;
}

// ‚îÄ‚îÄ‚îÄ Layer 9 : Garbage Bytecode Injection ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Layer 10 : Opaque Conditional Branches (LOADBOOL+TEST+JMP always-taken patterns inside)
// Inserts ~18% dead instructions: opaque conditionals, JMP-over blocks, single NOPs
function injectGarbage(proto){
  for(var i=0;i<proto.p.length;i++) injectGarbage(proto.p[i]);
  var codeLen=proto.code.length;
  if(codeLen<4) return;
  // Identify protected positions: instruction after any skip-next opcode
  var protectedPos=new Set();
  for(var pc=0;pc<codeLen;pc++){
    var inst=proto.code[pc];
    var op=inst&0xFF;
    if(op===BC.EQ||op===BC.LT||op===BC.LE||op===BC.TEST||op===BC.TESTSET){
      protectedPos.add(pc+1);
    }
    if(op===BC.LOADBOOL&&((inst>>24)&0xFF)!==0){
      protectedPos.add(pc+1);
    }
    if(op===BC.SUPER_GCALL||op===BC.SUPER_SELF_CALL||op===BC.SUPER_TEST_JMP||op===BC.SUPER_GETTAB_CALL){
      protectedPos.add(pc+1);
    }
  }
  var nInsert=Math.max(2,Math.floor(codeLen*0.18));
  var usedPos=new Set();
  var insertions=[];
  var needsTempReg=false;
  for(var i=0;i<nInsert;i++){
    var pos,tries=0;
    do{pos=Math.floor(Math.random()*(codeLen+1));tries++;}
    while((usedPos.has(pos)||protectedPos.has(pos))&&tries<200);
    if(tries>=200) continue;
    usedPos.add(pos);
    var r=Math.random();
    if(r<0.20){
      // Opaque conditional branch: LOADBOOL + TEST + JMP + garbage
      var tempReg=proto.maxstack;
      var blockLen=2+Math.floor(Math.random()*3);
      var instrs;
      if(Math.random()<0.5){
        // Variant A: LOADBOOL true, TEST C=1 ‚Üí (not true)==(1~=0) ‚Üí false ‚Üí don't skip ‚Üí JMP taken
        instrs=[
          bcEncode(BC.LOADBOOL,tempReg,1,0),
          bcEncode(BC.TEST,tempReg,0,1),
          bcEncodesBx(BC.JMP,0,blockLen)
        ];
      }else{
        // Variant B: LOADBOOL false, TEST C=0 ‚Üí (not false)==(0~=0) ‚Üí true==false ‚Üí false ‚Üí don't skip ‚Üí JMP taken
        instrs=[
          bcEncode(BC.LOADBOOL,tempReg,0,0),
          bcEncode(BC.TEST,tempReg,0,0),
          bcEncodesBx(BC.JMP,0,blockLen)
        ];
      }
      for(var gi=0;gi<blockLen;gi++){
        instrs.push(bcEncode(GARBAGE_OP,Math.floor(Math.random()*256),Math.floor(Math.random()*256),Math.floor(Math.random()*256)));
      }
      insertions.push({pos:pos,instrs:instrs});
      needsTempReg=true;
    }else if(r<0.55){
      // JMP-over-block: JMP + garbage
      var blockLen=2+Math.floor(Math.random()*3);
      var instrs=[bcEncodesBx(BC.JMP,0,blockLen)];
      for(var gi=0;gi<blockLen;gi++){
        instrs.push(bcEncode(GARBAGE_OP,Math.floor(Math.random()*256),Math.floor(Math.random()*256),Math.floor(Math.random()*256)));
      }
      insertions.push({pos:pos,instrs:instrs});
    }else{
      // Single garbage NOP
      insertions.push({pos:pos,instrs:[
        bcEncode(GARBAGE_OP,Math.floor(Math.random()*256),Math.floor(Math.random()*256),Math.floor(Math.random()*256))
      ]});
    }
  }
  if(needsTempReg) proto.maxstack++;
  insertions.sort(function(a,b){return a.pos-b.pos;});
  // Build cumulative insertion count per position
  var totalInserted=[];
  var cumulative=0;
  var insIdx=0;
  for(var pc=0;pc<=codeLen;pc++){
    while(insIdx<insertions.length&&insertions[insIdx].pos===pc){
      cumulative+=insertions[insIdx].instrs.length;
      insIdx++;
    }
    totalInserted[pc]=cumulative;
  }
  function newPC(oldPC){return oldPC+(totalInserted[oldPC]||0);}
  // Fix jump targets in existing instructions
  var jumpOps=[BC.JMP,BC.FORLOOP,BC.FORPREP,BC.TFORLOOP];
  for(var pc=0;pc<codeLen;pc++){
    var inst=proto.code[pc];
    var op=inst&0xFF;
    for(var ji=0;ji<jumpOps.length;ji++){
      if(op===jumpOps[ji]){
        var a=(inst>>8)&0xFF;
        var bx=(inst>>16)&0xFFFF;
        var sbx=bx-32767;
        var oldTarget=pc+1+sbx;
        var newSbx=newPC(oldTarget)-newPC(pc)-1;
        proto.code[pc]=bcEncodesBx(op,a,newSbx);
        break;
      }
    }
    // Layer 55: SUPER_TEST_JMP word 2 at pc+1 also contains sBx jump target
    if(op===BC.SUPER_TEST_JMP){
      var w2=proto.code[pc+1];
      var w2sbx=((w2>>16)&0xFFFF)-32767;
      var w2oldTarget=(pc+1)+1+w2sbx;
      var w2newSbx=newPC(w2oldTarget)-newPC(pc+1)-1;
      proto.code[pc+1]=bcEncodesBx(0,0,w2newSbx);
    }
  }
  // Build new code array with insertions spliced in
  var newCode=[];
  insIdx=0;
  for(var pc=0;pc<codeLen;pc++){
    while(insIdx<insertions.length&&insertions[insIdx].pos===pc){
      for(var gi=0;gi<insertions[insIdx].instrs.length;gi++){
        newCode.push(insertions[insIdx].instrs[gi]);
      }
      insIdx++;
    }
    newCode.push(proto.code[pc]);
  }
  while(insIdx<insertions.length){
    for(var gi=0;gi<insertions[insIdx].instrs.length;gi++){
      newCode.push(insertions[insIdx].instrs[gi]);
    }
    insIdx++;
  }
  proto.code=newCode;
}

// ‚îÄ‚îÄ‚îÄ Layer 54 : Control Flow Flattening ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Permutes code array randomly, builds successor table, converts jumps to absolute targets.
function controlFlowFlattening(proto){
  for(var i=0;i<proto.p.length;i++)controlFlowFlattening(proto.p[i]);
  var N=proto.code.length;
  if(N<=1){proto.cff=false;return;}
  // Fisher-Yates permutation: perm[oldPos] = newPos
  var perm=[];
  for(var i=0;i<N;i++)perm.push(i);
  for(var i=N-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var t=perm[i];perm[i]=perm[j];perm[j]=t;
  }
  var oldToNew=perm;
  var newToOld=new Array(N);
  for(var i=0;i<N;i++)newToOld[oldToNew[i]]=i;
  // Convert jump sBx to absolute targets in OLD code (before permutation)
  var jumpOps=[BC.JMP,BC.FORLOOP,BC.FORPREP,BC.TFORLOOP];
  for(var pc=0;pc<N;pc++){
    var inst=proto.code[pc];
    var op=inst&0xFF;
    if(jumpOps.indexOf(op)>=0){
      var a=(inst>>8)&0xFF;
      var sBx=((inst>>16)&0xFFFF)-32767;
      var oldTarget=pc+1+sBx; // 0-indexed target
      if(oldTarget<0)oldTarget=0;
      if(oldTarget>=N)oldTarget=N-1;
      var newTarget=oldToNew[oldTarget]+1; // 1-indexed for Lua runtime
      proto.code[pc]=bcEncodeBx(op,a,newTarget);
    }
    // Layer 55: SUPER_TEST_JMP word 2 at pc+1 contains sBx jump target
    if(op===BC.SUPER_TEST_JMP){
      var w2=proto.code[pc+1];
      var sBx2=((w2>>16)&0xFFFF)-32767;
      var oldTarget2=(pc+1)+1+sBx2;
      if(oldTarget2<0)oldTarget2=0;
      if(oldTarget2>=N)oldTarget2=N-1;
      var newTarget2=oldToNew[oldTarget2]+1;
      proto.code[pc+1]=bcEncodeBx(0,0,newTarget2);
    }
  }
  // Permute code array
  var newCode=new Array(N);
  for(var pc=0;pc<N;pc++)newCode[oldToNew[pc]]=proto.code[pc];
  proto.code=newCode;
  // Build successor table (0-indexed JS): succTable[newPos] = next newPos
  var succTable=new Array(N);
  for(var old=0;old<N-1;old++){
    succTable[oldToNew[old]]=oldToNew[old+1];
  }
  // Last instruction has no successor (RETURN exits)
  proto.succTable=succTable;
  proto.startPC=oldToNew[0]; // 0-indexed
  proto.cff=true;
}

// ‚îÄ‚îÄ‚îÄ Layer 1 : Polymorphic Opcode Aliases ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Layer 2 : Opcode Pool Shuffling (Fisher-Yates on pool of integers)
// Layer 3 : Dead Opcode Injection (20 dummy opcode values in pool)
// Generates per-build random opcode mapping: 3 aliases per opcode, shuffled pool, 20 dead values
function genBytecodeOpcodeMap(){
  var ALIAS_PER=3;  // Layer 1: 3 random aliases per opcode
  var DEAD_COUNT=20; // Layer 3: 20 dummy opcode values
  var totalOps=Math.min(BC_COUNT*(1+ALIAS_PER)+DEAD_COUNT+30,255);
  // Shuffle pool
  var pool=[];
  for(var i=1;i<=totalOps;i++)pool.push(i);
  for(var i2=pool.length-1;i2>0;i2--){
    var j=Math.floor(Math.random()*(i2+1));
    var tmp=pool[i2];pool[i2]=pool[j];pool[j]=tmp;
  }
  var pi2=0;
  var OP={},OP_ALIASES={};
  var opNames=Object.keys(BC);
  // Shuffle assignment order
  var shuffIdx=[];
  for(var si=0;si<opNames.length;si++)shuffIdx.push(si);
  for(var si2=shuffIdx.length-1;si2>0;si2--){
    var sj=Math.floor(Math.random()*(si2+1));
    var st=shuffIdx[si2];shuffIdx[si2]=shuffIdx[sj];shuffIdx[sj]=st;
  }
  for(var oi=0;oi<shuffIdx.length;oi++){
    var name=opNames[shuffIdx[oi]];
    OP[name]=pool[pi2++];
    OP_ALIASES[name]=[];
    for(var ai=0;ai<ALIAS_PER;ai++)OP_ALIASES[name].push(pool[pi2++]);
  }
  var DEAD=[];
  for(var di=0;di<DEAD_COUNT&&pi2<pool.length;di++)DEAD.push(pool[pi2++]);
  return{OP:OP,OP_ALIASES:OP_ALIASES,DEAD:DEAD};
}

function luaByteLiteral(bytes){
  if(bytes.length===0)return'""';
  return'"'+bytes.map(function(b){return'\\'+b;}).join('')+'"';
}

// ‚îÄ‚îÄ‚îÄ PROTOTYPE SERIALIZER ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
function bcSerializePrototype(proto,encStr,encNum,VM,KENC_KEY,KENC_MUL,FENC_KEY,FENC_MUL,FENC_ADD){
  var _vm=VM[proto.vmId||0];
  var OPMAP=_vm.OPMAP,AOXR=_vm.AOXR,FIELD_ORDER=_vm.FIELD_ORDER;
  var IMUT_SEED=_vm.IMUT_SEED,IMUT_MUL=_vm.IMUT_MUL;
  var CHAIN_SEED=_vm.CHAIN_SEED,CHAIN_MULT=_vm.CHAIN_MULT,CHAIN_ADD=_vm.CHAIN_ADD;
  // ‚îÄ‚îÄ‚îÄ Layer 53 : Execution-Trace Chaining (build-time) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Identify jump targets, compute sync values, encode instructions with chained IMUT key
  var jumpTargets={};
  var _cffEntry=proto.cff?(proto.startPC+1):1;
  jumpTargets[_cffEntry]=true; // entry point (1-indexed)
  for(var ji=0;ji<proto.code.length;ji++){
    var jinst=proto.code[ji];
    var jop=jinst&0xFF;
    var jpc=ji+1;
    if(jop===BC.JMP||jop===BC.FORLOOP||jop===BC.FORPREP||jop===BC.TFORLOOP){
      if(proto.cff){
        // CFF: BX field is absolute target (1-indexed)
        var jbx=((jinst>>16)&0xFFFF);
        if(jbx>=1&&jbx<=proto.code.length)jumpTargets[jbx]=true;
      }else{
        var jsBx=((jinst>>16)&0xFFFF)-32767;
        var jtarget=jpc+1+jsBx;
        if(jtarget>=1&&jtarget<=proto.code.length)jumpTargets[jtarget]=true;
      }
    }
    // Layer 55: SUPER_TEST_JMP contains a jump target in word 2
    if(jop===BC.SUPER_TEST_JMP){
      if(proto.cff){
        var _stw2pos=proto.succTable[ji];
        if(_stw2pos!==undefined){
          var _stw2=proto.code[_stw2pos];
          var _stbx=((_stw2>>16)&0xFFFF);
          if(_stbx>=1&&_stbx<=proto.code.length)jumpTargets[_stbx]=true;
        }
      }else{
        var _stw2n=proto.code[ji+1];
        var _stsbx=((_stw2n>>16)&0xFFFF)-32767;
        var _sttgt=(ji+2)+1+_stsbx;
        if(_sttgt>=1&&_sttgt<=proto.code.length)jumpTargets[_sttgt]=true;
      }
    }
    if(jop===BC.EQ||jop===BC.LT||jop===BC.LE||jop===BC.TEST||jop===BC.TESTSET){
      if(proto.cff){
        // Skip-next: 2 ahead in execution order via successor table
        var _sn=proto.succTable[ji];
        if(_sn!==undefined){var _sn2=proto.succTable[_sn];if(_sn2!==undefined)jumpTargets[_sn2+1]=true;}
      }else{
        if(jpc+2<=proto.code.length)jumpTargets[jpc+2]=true;
      }
    }
    if(jop===BC.LOADBOOL&&((jinst>>>24)&0xFF)!==0){
      if(proto.cff){
        var _sn3=proto.succTable[ji];
        if(_sn3!==undefined){var _sn4=proto.succTable[_sn3];if(_sn4!==undefined)jumpTargets[_sn4+1]=true;}
      }else{
        if(jpc+2<=proto.code.length)jumpTargets[jpc+2]=true;
      }
    }
  }
  // Compute deterministic sync values for each jump target
  var syncTable={};
  for(var st in jumpTargets){
    var stpc=parseInt(st);
    syncTable[stpc]=((CHAIN_SEED*stpc+CHAIN_ADD)&0xFFFFFF);
  }
  // Encode instructions with chained IMUT key (Layer 53)
  // Build encoding order: successor-table order for CFF, sequential otherwise
  var encOrder=[];
  if(proto.cff){
    var _ep=proto.startPC,_ev={};
    while(_ep!==undefined&&_ep>=0&&_ep<proto.code.length&&!_ev[_ep]){
      _ev[_ep]=true;encOrder.push(_ep);_ep=proto.succTable[_ep];
    }
  }else{
    for(var _ei2=0;_ei2<proto.code.length;_ei2++)encOrder.push(_ei2);
  }
  var encCode=new Array(proto.code.length);
  var chain=syncTable[encOrder[0]+1];
  for(var _oi=0;_oi<encOrder.length;_oi++){
    var ei=encOrder[_oi];
    var pc1=ei+1;
    if(syncTable[pc1]!==undefined)chain=syncTable[pc1];
    var mutKey=((chain*IMUT_SEED+IMUT_MUL)%16777216);
    var inst=proto.code[ei];
    var op=(inst)&0xFF;
    var a=(inst>>8)&0xFF;
    var b=(inst>>16)&0xFF;
    var c=(inst>>>24)&0xFF;
    var newOp=op;
    if(op===GARBAGE_OP){
      newOp=OPMAP.DEAD[Math.floor(Math.random()*OPMAP.DEAD.length)];
    }else{
      var opName=null;
      var opKeys=Object.keys(BC);
      for(var oki=0;oki<opKeys.length;oki++){
        if(BC[opKeys[oki]]===op){opName=opKeys[oki];break;}
      }
      if(opName&&OPMAP.OP[opName]!==undefined){
        var allOps=[OPMAP.OP[opName]].concat(OPMAP.OP_ALIASES[opName]||[]);
        newOp=allOps[Math.floor(Math.random()*allOps.length)];
      }
    }
    newOp=newOp^AOXR; // Layer 4 : Opcode XOR Masking (AOXR)
    var bytes=[0,0,0,0]; // Layer 7 : Field Permutation (FIELD_ORDER)
    bytes[FIELD_ORDER[0]]=newOp&0xFF;
    bytes[FIELD_ORDER[1]]=a;
    bytes[FIELD_ORDER[2]]=b;
    bytes[FIELD_ORDER[3]]=c;
    var keyBytes=[(mutKey)&0xFF,(mutKey>>8)&0xFF,(mutKey>>16)&0xFF];
    var ki=0;
    for(var fi=0;fi<4;fi++){
      if(fi===FIELD_ORDER[0])continue;
      bytes[fi]=(bytes[fi]^keyBytes[ki])&0xFF;
      ki++;
    }
    encCode[ei]=bytes[0]|(bytes[1]<<8)|(bytes[2]<<16)|(bytes[3]<<24);
    chain=(((chain*CHAIN_MULT+encCode[ei]+CHAIN_ADD)%16777216)+16777216)%16777216;
  }
  var codeStr='{'+encCode.join(',')+'}';
  // Serialize sync table as PROTO[8]
  var syncParts=[];
  for(var sk in syncTable){syncParts.push('['+sk+']='+syncTable[sk]);}
  var syncStr='{'+syncParts.join(',')+'}';
  // Serialize constants
  var kParts=proto.k.map(function(v,idx){
    if(v===null||v===undefined)return'{0}';
    if(v===true)return'{1,1}';
    if(v===false)return'{1,0}';
    if(typeof v==='number'){
      if(Number.isInteger(v)&&v>=0&&v<=0x7FFFFFFF){
        var kKey=((KENC_KEY*(idx+1)+KENC_MUL)&0xFFFFFF);
        return'{2,'+encNum((v^kKey)>>>0)+',1}';
      }
      return'{2,'+encNum(v)+'}';
    }
    if(typeof v==='string')return'{3,'+encStr(v)+'}';
    return'{0}';
  });
  var kStr='{'+kParts.join(',')+'}';
  // ‚îÄ‚îÄ‚îÄ Layer 29 : Per-Proto Rolling XOR ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Sub-prototypes encrypted with per-index key, decrypted lazily on first CLOSURE
  var pParts=proto.p.map(function(sp,idx){
    var subStr=bcSerializePrototype(sp,encStr,encNum,VM,KENC_KEY,KENC_MUL,FENC_KEY,FENC_MUL,FENC_ADD);
    var factoryStr='return function(_SS) return '+subStr+' end';
    var encBytes=encryptProtoString(factoryStr,idx,FENC_KEY,FENC_MUL,FENC_ADD);
    return luaByteLiteral(encBytes);
  });
  var pStr='{'+pParts.join(',')+'}';
  // Upvalue descriptors
  var upStr='{'+proto.updescs.map(function(d){return'{'+(d.instack?1:0)+','+d.idx+'}';}).join(',')+'}';
  // Serialize successor table and startPC for CFF (PROTO[10], PROTO[11])
  var succStr='nil',startStr='nil';
  if(proto.cff){
    var succParts=[];
    for(var si=0;si<proto.code.length;si++){
      succParts.push(proto.succTable[si]!==undefined?(proto.succTable[si]+1):0);
    }
    succStr='{'+succParts.join(',')+'}';
    startStr=String(proto.startPC+1); // 1-indexed for Lua
  }
  return'{'+[codeStr,kStr,pStr,upStr,proto.numparams,proto.is_vararg?'true':'false',proto.maxstack,syncStr,proto.rkThreshold||128,succStr,startStr,proto.vmId||0].join(',')+'}';
}

function encryptProtoString(plainStr,protoIdx,FENC_KEY,FENC_MUL,FENC_ADD){
  var keyState=((FENC_KEY*(protoIdx+1)+FENC_MUL)&0xFFFFFF);
  var encrypted=[];
  for(var i=0;i<plainStr.length;i++){
    var plainByte=plainStr.charCodeAt(i)&0xFF;
    var encByte=plainByte^(keyState&0xFF);
    encrypted.push(encByte);
    keyState=((keyState*31+plainByte+FENC_ADD)&0xFFFFFF);
  }
  return encrypted;
}

// ‚îÄ‚îÄ‚îÄ BYTECODE VM GENERATOR ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
function generateBytecodeVM(VM,protoStr,strArr,STDLIB,rtKeys,kEncKeyExpr,kEncMulExpr,fencKeyExpr,fencMulExpr,fencAddExpr,BUILD_ID,watermarkIdx,MBA_TEMPLATE,encNum){
  // ‚îÄ‚îÄ‚îÄ Layer 24 : Random Variable Names ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // 6-10 char strings from lLiI1 charset, deduplicated per build
  var _usedNames=new Set();
  function rn(){
    var pool='lLiI1';
    var s;
    do{s='_';var len=5+Math.floor(Math.random()*5);
      for(var i=0;i<len;i++)s+=pool[Math.floor(Math.random()*pool.length)];
    }while(_usedNames.has(s));
    _usedNames.add(s);return s;
  }
  function shuffle(arr){
    for(var si=arr.length-1;si>0;si--){
      var sj=Math.floor(Math.random()*(si+1));
      var st=arr[si];arr[si]=arr[sj];arr[sj]=st;
    }
    return arr;
  }
  // ‚îÄ‚îÄ‚îÄ Layer 41 : Expression Polymorphism ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Always use arithmetic ops ‚Äî bit32 variants can produce wrong results in edge
  // cases (bit32.band truncates to 32 bits, bit32.rshift treats sign bit differently).
  // polyMod16M was already proven to need this fix; apply uniformly for reliability.
  function polyMod256(expr){
    return expr+'%256';
  }
  function polyMod16M(expr){
    return expr+'%16777216';
  }
  function polyDiv256(expr){
    return'math.floor('+expr+'/256)';
  }
  function polyDiv65536(expr){
    return'math.floor('+expr+'/65536)';
  }
  function polyMul262144(expr){
    return expr+'*262144';
  }
  var R={};
  // Shared names (used in init code, outside execute functions)
  ['S','ES','EKA','EKB','NKDEC','accLen','sHash','nextSI',
   'dI','dJ','dR','ki','tCk','tI','tJ',
   'EAST','dkAST','dpAST','PROTO','GENV','RT'
  ].forEach(function(n){R[n]=rn();});
  // Layer 56: Per-VM execute function names (forward-declared)
  var execNames=[rn(),rn()];

  // ‚îÄ‚îÄ‚îÄ Layer 11 : Stateful String Encryption ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Layer 12 : Dual-Key Decryption (EKA/EKB ‚Äî two independently derived key arrays)
  // Layer 13 : Position-Dependent EKB (saltA + i*SMUL + SADD) % 256
  // Rolling XOR key shifts per-string via cumulative length
  var KEY_LEN=16;
  var masterKey=Array.from({length:KEY_LEN},function(){return Math.floor(Math.random()*254)+1;});
  var saltA=Array.from({length:KEY_LEN},function(){return Math.floor(Math.random()*254)+1;});
  var SMUL=Math.floor(Math.random()*6)+3;
  var SADD=Math.floor(Math.random()*60)+20;
  var keyA=masterKey.map(function(b,i){return b^saltA[i];});
  var keyB=saltA.map(function(s,i){return(s+(i*SMUL+SADD))%256;});
  var HMOD=16777216;
  var HSEED=Math.floor(Math.random()*(HMOD-1))+1;
  var HMUL=(Math.floor(Math.random()*126)+1)*2+1;
  var HADD=Math.floor(Math.random()*254)+1;

  // ‚îÄ‚îÄ‚îÄ Layer 5 : OPDEC Lookup Table (Layer 56: dual tables) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Maps XOR'd(random_op) ‚Üí canonical index ‚Äî one per VM
  var opKeys=Object.keys(BC);
  var opdecEntriesArr=[[],[]];
  for(var _dvi=0;_dvi<2;_dvi++){
    var _dop=VM[_dvi].OPMAP;
    for(var oki=0;oki<opKeys.length;oki++){
      var opName=opKeys[oki];
      var canonical=BC[opName];
      var allVals=[_dop.OP[opName]].concat(_dop.OP_ALIASES[opName]||[]);
      for(var avi=0;avi<allVals.length;avi++){
        opdecEntriesArr[_dvi].push('['+allVals[avi]+']='+canonical);
      }
    }
  }

  // Encrypt strings
  var TMOD=16777216;
  var TSEED=Math.floor(Math.random()*(TMOD-1))+1;
  var TMUL=(Math.floor(Math.random()*126)+1)*2+1;
  var _sAccLen=0,_sHash=HSEED,_tChk=TSEED;
  var encStrs=strArr.map(function(s,i){
    var bytes=[];var idx=i+1;
    for(var j=0;j<s.length;j++){
      var ki2=(idx+j+_sAccLen)%KEY_LEN;
      var plainByte=s.charCodeAt(j)&0xFF;
      var enc=plainByte^masterKey[ki2]^(_sHash&0xFF);
      bytes.push(enc);
      _tChk=(_tChk*TMUL+enc+1)%TMOD;
    }
    for(var j2=0;j2<s.length;j2++){
      _sHash=(_sHash*HMUL+(s.charCodeAt(j2)&0xFF)+HADD)%HMOD;
    }
    _sAccLen=(_sAccLen+s.length)%KEY_LEN;
    return luaByteLiteral(bytes);
  });

  // Replace _S references in protoStr with safe name
  var safeProtoStr=protoStr.replace(/_S\[/g,R.S+'[');
  // ‚îÄ‚îÄ‚îÄ Layer 16 : Factory Function Wrapper ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // function(_SS) return {...} end ‚Äî passes string table
  var factoryProtoStr=safeProtoStr.replace(new RegExp(R.S.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\[','g'),'_SS[');
  var factoryStr='return function(_SS) return '+factoryProtoStr+' end';

  // ‚îÄ‚îÄ‚îÄ Layer 15 : Sequential AST Encryption ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Rolling XOR ‚Äî each byte depends on all prior plaintext bytes
  var AST_MOD=16777216;
  var AST_SEED=Math.floor(Math.random()*(AST_MOD-1))+1;
  var AST_MULT=(Math.floor(Math.random()*126)+1)*2+1;
  var AST_ADD=Math.floor(Math.random()*254)+1;
  var astDk=AST_SEED;
  var encAstBytes=[];
  for(var ei=0;ei<factoryStr.length;ei++){
    var fb=factoryStr.charCodeAt(ei)&0xFF;
    var enc2=fb^(astDk&0xFF);
    encAstBytes.push(enc2);
    _tChk=(_tChk*TMUL+enc2+1)%TMOD;
    astDk=(astDk*AST_MULT+fb+AST_ADD)%AST_MOD;
  }
  var encAstLiteral=luaByteLiteral(encAstBytes);

  // Feed keys into tamper checksum
  for(var ti=0;ti<keyA.length;ti++)_tChk=(_tChk*TMUL+keyA[ti]+1)%TMOD;
  for(var ti2=0;ti2<keyB.length;ti2++)_tChk=(_tChk*TMUL+keyB[ti2]+1)%TMOD;
  // Feed OPDEC entries from BOTH VMs into tamper checksum (Layer 56)
  var opdecPairsArr=[[],[]];
  for(var _tvi=0;_tvi<2;_tvi++){
    var _top=VM[_tvi].OPMAP;
    for(var ok2=0;ok2<opKeys.length;ok2++){
      var on2=opKeys[ok2];
      var can2=BC[on2];
      var av2=[_top.OP[on2]].concat(_top.OP_ALIASES[on2]||[]);
      for(var av2i=0;av2i<av2.length;av2i++){
        opdecPairsArr[_tvi].push({k:av2[av2i],v:can2});
      }
    }
    opdecPairsArr[_tvi].sort(function(a,b){return a.k-b.k;});
    for(var op=0;op<opdecPairsArr[_tvi].length;op++){
      _tChk=(_tChk*TMUL+opdecPairsArr[_tvi][op].k+1)%TMOD;
      _tChk=(_tChk*TMUL+opdecPairsArr[_tvi][op].v+1)%TMOD;
    }
  }

  // ‚îÄ‚îÄ‚îÄ Layer 26 : Anti-Tamper Layer B (build-time, per-VM) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Delayed OPDEC key verification after 500 instructions; corrupts hidden table
  var TMOD_B=1000000007;
  var TMUL2=Math.floor(Math.random()*900)+100;
  var MASK2=Math.floor(Math.random()*0xFFFF)+1;
  var _tExp2EncArr=[],opdecCountArr=[];
  for(var _bvi=0;_bvi<2;_bvi++){
    var _ts2=Math.floor(Math.random()*TMOD_B);
    var _tc2=_ts2;
    for(var tb=0;tb<opdecPairsArr[_bvi].length;tb++){
      _tc2=(_tc2*TMUL2+opdecPairsArr[_bvi][tb].k+1)%TMOD_B;
    }
    _tExp2EncArr.push({seed:_ts2,enc:_tc2^MASK2});
    opdecCountArr.push(opdecPairsArr[_bvi].length);
  }

  // ‚îÄ‚îÄ‚îÄ Layer 22 : Opaque True/False Predicates ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Layer 40 : Opaque Predicate Expansion (9 true + 8 false templates)
  function genOpaqueTrue(){
    var tpls=[
      function(){var N=Math.floor(Math.random()*0xFFFF)+1;return'bit32.band('+N+','+N+')=='+N;},
      function(){var N=Math.floor(Math.random()*9998)+2;return'('+N+'*'+N+')%4~=3';},
      function(){var N=Math.floor(Math.random()*9998)+2;return N+'%1==0';},
      function(){var N=Math.floor(Math.random()*9998)+2;return'('+N+'*'+N+'+'+N+')%2==0';},
      function(){var N=Math.floor(Math.random()*0xFFFF)+1;return'bit32.bor('+N+',0)=='+N;},
      function(){var N=Math.floor(Math.random()*0xFFFF)+1;return'type('+N+')=="number"';},
      function(){var N=Math.floor(Math.random()*0xFFFF)+1;return'select(1,'+N+')=='+N;},
      function(){var N=Math.floor(Math.random()*9998)+2;return'math.floor('+N+')=='+N;},
      function(){var N=Math.floor(Math.random()*0x7FFF)+1;var K=Math.floor(Math.random()*7)+1;return'bit32.rshift(bit32.lshift('+N+','+K+'),'+K+')=='+N;}
    ];
    return tpls[Math.floor(Math.random()*tpls.length)]();
  }
  function genOpaqueFalse(){
    var tpls=[
      function(){var N=Math.floor(Math.random()*0xEEEE)+0x1111;return'bit32.band('+N+',255)=='+(((N&0xFF)+1)&0xFF);},
      function(){var N=Math.floor(Math.random()*9998)+2;return'('+N+'*'+N+')%4==3';},
      function(){var N=Math.floor(Math.random()*9998)+2;return'('+N+'*'+N+'+'+N+')%2==1';},
      function(){var N=Math.floor(Math.random()*9998)+2;return N+'%1~=0';},
      function(){var N=Math.floor(Math.random()*0xFFFF)+1;return'type('+N+')=="string"';},
      function(){return'string.len("")~=0';},
      function(){var N=Math.floor(Math.random()*0xFFFF)+1;return'bit32.rshift('+N+',32)=='+N;},
      function(){var N=Math.floor(Math.random()*9998)+2;return'math.floor('+N+'+0.5)=='+N+'+1';}
    ];
    return tpls[Math.floor(Math.random()*tpls.length)]();
  }

  // Build the inner Lua code
  // Field extraction expressions in Lua (FIELD_ORDER set per-VM in loop below)
  // Position N means: shift right by N*8, mask with 0xFF
  var shifts=[1,256,65536,16777216]; // 2^0, 2^8, 2^16, 2^24
  function fieldExpr(varName,fieldIdx){
    // fieldIdx: 0=op, 1=a, 2=b, 3=c
    var bytePos=FIELD_ORDER[fieldIdx]; // which byte position holds this field
    if(bytePos===0)return polyMod256(varName);
    if(bytePos===1)return polyMod256(polyDiv256(varName));
    if(bytePos===2)return polyMod256(polyDiv65536(varName));
    return polyMod256('math.floor('+varName+'/16777216)');
  }
  function bxExpr(varName){
    // Bx = bytes at positions for B and C combined as 16-bit
    // B is at FIELD_ORDER[2], C is at FIELD_ORDER[3]
    var bPos=FIELD_ORDER[2],cPos=FIELD_ORDER[3];
    if(cPos===bPos+1){
      var inner;
      if(bPos===0)inner=varName;
      else if(bPos===1)inner=polyDiv256(varName);
      else inner='math.floor('+varName+'/'+shifts[bPos]+')';
      return inner+'%65536';
    }else{
      // B and C not adjacent or in wrong order ‚Äî compute separately and combine
      var bE=polyMod256('math.floor('+varName+'/'+shifts[bPos]+')');
      var cE=polyMod256('math.floor('+varName+'/'+shifts[cPos]+')');
      return'('+bE+'+'+cE+'*256)';
    }
  }

  // Actually, for Bx mode we need B*256+C or C*256+B depending on field order
  // The compiler already encoded Bx into bits 16-31 of canonical encoding.
  // After field permutation, we need to reconstruct Bx from the permuted positions.
  // Bx = original_b | (original_c << 8)  where original_b was bits 16-23, original_c was bits 24-31
  // After permutation: original_b is at byte position FIELD_ORDER[2], original_c is at byte position FIELD_ORDER[3]
  // So: Bx = byte_at(FIELD_ORDER[2]) + byte_at(FIELD_ORDER[3]) * 256
  // But wait ‚Äî we extract bytes by position, and FIELD_ORDER tells us where each field went.
  // To get original_b: read byte at position INV_ORDER[2] (which is where field 2 ended up... no, INV_ORDER maps position->field)
  // Actually: FIELD_ORDER[fieldIdx] = bytePosition. So field 2 (B) is at byte position FIELD_ORDER[2].
  // To READ field 2: extract byte at position FIELD_ORDER[2]. But we already set INV_ORDER so that INV_ORDER[FIELD_ORDER[2]]=2.
  // fieldExpr already handles this correctly for individual bytes.
  // For Bx: Bx = B + C*256 = fieldExpr(2) + fieldExpr(3)*256

  var lines=[];

  // ‚îÄ‚îÄ‚îÄ Layer 47 : Initialization Order Randomization ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // __tostring, getfenv/setfenv, rawequal blocks shuffled per build
  lines.push('local _GENV=getgenv and getgenv() or _G');
  var _envRef=rn();
  var _cachedFn=rn();
  var initBlocks=[
    // Layer 28 : __tostring Hijacking ‚Äî poisons string/number metatable __tostring
    ['pcall(function() local _mt=getmetatable("") if _mt then _mt.__tostring=nil end end)',
     'pcall(function() local _mt=getmetatable(0) if _mt then _mt.__tostring=nil end end)'],
    // Layer 36 : Environment Locking ‚Äî overrides getfenv/setfenv
    ['local '+_envRef+'=_GENV',
     'pcall(function() _GENV.getfenv=function() return '+_envRef+' end end)',
     'pcall(function() _GENV.setfenv=function() end end)'],
    // Layer 36 : Environment Locking ‚Äî rawequal cache for periodic integrity check
    ['local '+_cachedFn+'=_GENV.rawequal']
  ];
  shuffle(initBlocks);
  for(var ib=0;ib<initBlocks.length;ib++){
    for(var ibl=0;ibl<initBlocks[ib].length;ibl++){
      lines.push(initBlocks[ib][ibl]);
    }
  }
  // ‚îÄ‚îÄ‚îÄ Layer 44 : Roblox Environment Gate ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // EKA byte pre-XOR'd with value derived from game/workspace type checks
  var ENV_MULT=Math.floor(Math.random()*60)+5;
  var ENV_IDX=Math.floor(Math.random()*KEY_LEN); // which EKA byte to XOR
  var ENV_EXPECTED=3; // game(1)+workspace(2)=3 in real Roblox
  var envK=(ENV_EXPECTED*ENV_MULT)&0xFF;
  keyA[ENV_IDX]^=envK; // pre-XOR so runtime must undo it
  lines.push('local '+R.EKA+'={'+keyA.join(',')+'}');
  lines.push('local '+R.EKB+'={'+keyB.join(',')+'}');
  lines.push('local '+R.ES+'={'+encStrs.join(',')+'}');
  // Runtime environment check ‚Äî derives _envBit from Roblox globals
  var _envBit=rn(),_envK=rn();
  lines.push('local '+_envBit+'=0');
  lines.push('pcall(function() if type(game)=="userdata" then '+_envBit+'='+_envBit+'+1 end end)');
  lines.push('pcall(function() if type(workspace)=="userdata" then '+_envBit+'='+_envBit+'+2 end end)');
  // ENV-GATE: silent ‚Äî no debug output in production
  lines.push('local '+_envK+'=bit32.band('+_envBit+'*'+ENV_MULT+',255)');
  lines.push(R.EKA+'['+(ENV_IDX+1)+']=bit32.bxor('+R.EKA+'['+(ENV_IDX+1)+'],'+_envK+')');
  lines.push('local '+R.accLen+'=0');
  lines.push('local '+R.sHash+'='+HSEED);
  lines.push('local '+R.nextSI+'=1');

  // ‚îÄ‚îÄ‚îÄ Layer 14 : Lazy String Metatable / Layer 49 : String Decryption Variation
  // Randomly picks lazy metatable (A) or eager for-loop decode (B) per build
  var STR_DECRYPT_VARIANT=Math.floor(Math.random()*2);
  // Helper: emit the inner decryption loop body for one string
  function emitStrDecryptLoop(idxExpr,indent){
    lines.push(indent+'local '+R.dR+'={}');
    lines.push(indent+'for '+R.ki+'=1,#'+R.ES+'['+idxExpr+'] do');
    lines.push(indent+'  local _ki=('+idxExpr+'+'+R.ki+'-1+'+R.accLen+')%'+KEY_LEN+'+1');
    lines.push(indent+'  local _inc='+polyMod256('((_ki-1)*'+SMUL+'+'+SADD+')'));
    lines.push(indent+'  local _sa='+polyMod256('('+R.EKB+'[_ki]-_inc+256)'));
    lines.push(indent+'  local _pb=bit32.bxor(string.byte('+R.ES+'['+idxExpr+'],'+R.ki+'),bit32.bxor('+R.EKA+'[_ki],_sa),'+polyMod256(R.sHash)+')');
    lines.push(indent+'  '+R.dR+'['+R.ki+']=string.char(_pb)');
    lines.push(indent+'end');
    lines.push(indent+'for '+R.ki+'=1,#'+R.dR+' do');
    lines.push(indent+'  '+R.sHash+'='+polyMod16M('('+R.sHash+'*'+HMUL+'+string.byte('+R.dR+'['+R.ki+'],1)+'+HADD+')'));
    lines.push(indent+'end');
    lines.push(indent+R.accLen+'=('+R.accLen+'+#'+R.dR+')%'+KEY_LEN);
  }
  if(STR_DECRYPT_VARIANT===0){
    // Variant A: Lazy metatable ‚Äî decrypts on-demand via __index
    lines.push('local '+R.S+'=setmetatable({},{__index=function('+R.dI+','+R.dJ+')');
    lines.push('  while '+R.nextSI+'<='+R.dJ+' do');
    emitStrDecryptLoop(R.nextSI,'    ');
    lines.push('    rawset('+R.dI+','+R.nextSI+',table.concat('+R.dR+'))');
    lines.push('    '+R.nextSI+'='+R.nextSI+'+1');
    lines.push('  end');
    lines.push('  return rawget('+R.dI+','+R.dJ+')');
    lines.push('end})');
  }else{
    // Variant B: Eager decode ‚Äî all strings decrypted at init (no metatable fingerprint)
    lines.push('local '+R.S+'={}');
    lines.push('for '+R.nextSI+'=1,#'+R.ES+' do');
    emitStrDecryptLoop(R.nextSI,'  ');
    lines.push('  '+R.S+'['+R.nextSI+']=table.concat('+R.dR+')');
    lines.push('end');
  }

  // ‚îÄ‚îÄ‚îÄ Layer 6 : Metatable-Based OPDEC (Layer 56: dual tables) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Two hidden tables with __index metatables ‚Äî one per VM
  var _hiddenNames=[rn(),rn()];
  var _opdecNames=[rn(),rn()];
  for(var _ovi=0;_ovi<2;_ovi++){
    lines.push('local '+_hiddenNames[_ovi]+'={'+opdecEntriesArr[_ovi].join(',')+'}');
    lines.push('local '+_opdecNames[_ovi]+'=setmetatable({},{__index=function(_,_k) return '+_hiddenNames[_ovi]+'[_k] end})');
  }

  // ‚îÄ‚îÄ‚îÄ Layer 27 : Anti-Tamper Layer C (both OPDECs) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  for(var _cvi=0;_cvi<2;_cvi++){
    lines.push('do local _n=0 for _ in pairs('+_hiddenNames[_cvi]+') do _n=_n+1 end');
    lines.push('if _n~='+opdecCountArr[_cvi]+' then');
    lines.push('  for _k in pairs('+_hiddenNames[_cvi]+') do '+_hiddenNames[_cvi]+'[_k]=bit32.bxor('+_hiddenNames[_cvi]+'[_k],255) end');
    lines.push('end end');
  }

  // ‚îÄ‚îÄ‚îÄ Layer 25 : Anti-Tamper Layer A ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Checksum over strings + AST + EKA + EKB + both OPDECs; corrupts EKA on mismatch
  lines.push('local '+R.EAST+'='+encAstLiteral);
  lines.push('do local '+R.tCk+'='+TSEED);
  lines.push('for '+R.tI+'=1,#'+R.ES+' do for '+R.tJ+'=1,#'+R.ES+'['+R.tI+'] do');
  lines.push('  '+R.tCk+'='+polyMod16M('('+R.tCk+'*'+TMUL+'+string.byte('+R.ES+'['+R.tI+'],'+R.tJ+')+1)'));
  lines.push('end end');
  lines.push('for '+R.tI+'=1,#'+R.EAST+' do');
  lines.push('  '+R.tCk+'='+polyMod16M('('+R.tCk+'*'+TMUL+'+string.byte('+R.EAST+','+R.tI+')+1)'));
  lines.push('end');
  lines.push('for '+R.tI+'=1,#'+R.EKA+' do');
  lines.push('  '+R.tCk+'='+polyMod16M('('+R.tCk+'*'+TMUL+'+'+R.EKA+'['+R.tI+']+1)'));
  lines.push('end');
  lines.push('for '+R.tI+'=1,#'+R.EKB+' do');
  lines.push('  '+R.tCk+'='+polyMod16M('('+R.tCk+'*'+TMUL+'+'+R.EKB+'['+R.tI+']+1)'));
  lines.push('end');
  // Hash BOTH OPDEC tables (Layer 56)
  for(var _avi=0;_avi<2;_avi++){
    lines.push('do local _ks={} for '+R.tI+' in pairs('+_hiddenNames[_avi]+') do _ks[#_ks+1]='+R.tI+' end table.sort(_ks)');
    lines.push('for _,'+R.tI+' in ipairs(_ks) do');
    lines.push('  '+R.tCk+'='+polyMod16M('('+R.tCk+'*'+TMUL+'+'+R.tI+'+1)'));
    lines.push('  '+R.tCk+'='+polyMod16M('('+R.tCk+'*'+TMUL+'+'+_hiddenNames[_avi]+'['+R.tI+']+1)'));
    lines.push('end end');
  }
  lines.push('if '+R.tCk+'~='+_tChk+' then');
  lines.push('  for '+R.tI+'=1,#'+R.EKA+' do '+R.EKA+'['+R.tI+']=bit32.bxor('+R.EKA+'['+R.tI+'],171) end');
  lines.push('end end');

  // ‚îÄ‚îÄ‚îÄ Layer 46 : Decoy Loadstring Traps ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // 2-3 fake AST decrypt loops with encrypted "return function() end" payloads
  var DECOY_COUNT=Math.floor(Math.random()*2)+2; // 2-3 decoys
  for(var dc=0;dc<DECOY_COUNT;dc++){
    var fakeStr='return function() end';
    var fakeSeed=Math.floor(Math.random()*16777215)+1;
    var fakeMult=(Math.floor(Math.random()*126)+1)*2+1;
    var fakeAdd=Math.floor(Math.random()*254)+1;
    var fakeMod=16777216;
    var fdk=fakeSeed;
    var fakeBytes=[];
    for(var fi=0;fi<fakeStr.length;fi++){
      var fb2=fakeStr.charCodeAt(fi)&0xFF;
      fakeBytes.push(fb2^(fdk&0xFF));
      fdk=(fdk*fakeMult+fb2+fakeAdd)%fakeMod;
    }
    var fakeLit=luaByteLiteral(fakeBytes);
    var _fdk=rn(),_fdp=rn(),_feast=rn();
    lines.push('do');
    lines.push('  local '+_fdk+'='+fakeSeed);
    lines.push('  local '+_fdp+'={}');
    lines.push('  local '+_feast+'='+fakeLit);
    lines.push('  for _i=1,#'+_feast+' do');
    lines.push('    local _b=bit32.bxor(string.byte('+_feast+',_i),'+polyMod256(_fdk)+')');
    lines.push('    '+_fdp+'[_i]=string.char(_b)');
    lines.push('    '+_fdk+'='+polyMod16M('('+_fdk+'*'+fakeMult+'+_b+'+fakeAdd+')'));
    lines.push('  end');
    lines.push('  pcall(load or loadstring,table.concat('+_fdp+'))');
    lines.push('end');
  }

  // ‚îÄ‚îÄ‚îÄ Layer 45 : Loadstring Canary ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Verifies loadstring("return A+B") returns callable with correct result. Corrupts EKA on failure.
  var canaryA=Math.floor(Math.random()*9000)+1000;
  var canaryB=Math.floor(Math.random()*9000)+1000;
  var _ckFn=rn();
  lines.push('do');
  lines.push('  local '+_ckFn+'=(load or loadstring)("return '+canaryA+'+'+canaryB+'")');
  lines.push('  if type('+_ckFn+')~="function" or '+_ckFn+'()~='+(canaryA+canaryB)+' then');
  lines.push('    for _i=1,#'+R.EKA+' do '+R.EKA+'[_i]=bit32.bxor('+R.EKA+'[_i],170) end');
  lines.push('  end');
  lines.push('end');

  // ‚îÄ‚îÄ‚îÄ Layer 51 : C-Closure / Native Function Verification ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Verifies type, math.floor, string.byte, nested pcall return correct values.
  // Corrupts EKA on sandbox detection (hooked stdlib functions).
  var _cv1=rn(),_cv2=rn(),_cv3=rn(),_cv4=rn(),_cv5=rn(),_cv6=rn(),_cv7=rn();
  var L51_XOR=Math.floor(Math.random()*254)+1;
  lines.push('do');
  lines.push('  local '+_cv1+','+_cv2+'=pcall(type,1)');
  lines.push('  local '+_cv3+'=math.floor(1.5)');
  lines.push('  local '+_cv4+'=string.byte("A")');
  lines.push('  local '+_cv5+','+_cv6+','+_cv7+'=pcall(pcall,type,"x")');
  lines.push('  if not('+_cv1+' and '+_cv2+'=="number" and '+_cv3+'==1 and '+_cv4+'==65 and '+_cv5+' and '+_cv6+' and '+_cv7+'=="string") then');
  lines.push('    for _i=1,#'+R.EKA+' do '+R.EKA+'[_i]=bit32.bxor('+R.EKA+'[_i],'+L51_XOR+') end');
  lines.push('  end');
  lines.push('end');

  // Layer 15 / Layer 16 : AST decryption + factory function execution (runtime)
  lines.push('local '+R.dkAST+'='+AST_SEED);
  lines.push('local '+R.dpAST+'={}');
  lines.push('for _i=1,#'+R.EAST+' do');
  lines.push('  local _b=bit32.bxor(string.byte('+R.EAST+',_i),'+polyMod256(R.dkAST)+')');
  lines.push('  '+R.dpAST+'[_i]=string.char(_b)');
  lines.push('  '+R.dkAST+'='+polyMod16M('('+R.dkAST+'*'+AST_MULT+'+_b+'+AST_ADD+')'));
  lines.push('end');
  lines.push('local '+R.PROTO+'=(load or loadstring)(table.concat('+R.dpAST+'))()('+R.S+')');
  lines.push(R.EAST+'=nil '+R.dpAST+'=nil '+R.dkAST+'=nil');

  // Per-proto encryption keys
  var _fkName=rn(),_fmName=rn(),_faName=rn();
  lines.push('local '+_fkName+'='+fencKeyExpr);
  lines.push('local '+_fmName+'='+fencMulExpr);
  lines.push('local '+_faName+'='+fencAddExpr);

  // Layer 8 / Layer 56 : Polymorphic IR keys ‚Äî two pairs (one per VM)
  var _imSeedNames=[rn(),rn()],_imMulNames=[rn(),rn()];
  for(var _imvi=0;_imvi<2;_imvi++){
    lines.push('local '+_imSeedNames[_imvi]+'='+encNum(VM[_imvi].IMUT_SEED));
    lines.push('local '+_imMulNames[_imvi]+'='+encNum(VM[_imvi].IMUT_MUL));
  }

  // ‚îÄ‚îÄ‚îÄ Layer 18 : K Table Lazy Encryption ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Integers XOR'd with per-index key, lazy metatable decrypts on access
  var _decK=rn();
  lines.push('local function '+_decK+'(_kt,_kk,_km)');
  lines.push('  local _raw={}');
  lines.push('  for _i,_c in ipairs(_kt) do');
  lines.push('    if _c[1]==0 then _raw[_i]={0}');
  lines.push('    elseif _c[1]==1 then _raw[_i]={1,_c[2]==1}');
  lines.push('    elseif _c[1]==2 then');
  lines.push('      if _c[3] then _raw[_i]={2,_c[2],_i}');
  lines.push('      else _raw[_i]={1,_c[2]} end');
  lines.push('    elseif _c[1]==3 then _raw[_i]={1,_c[2]}');
  lines.push('    end');
  lines.push('  end');
  lines.push('  return setmetatable({},{__index=function(_t,_i)');
  lines.push('    local _e=_raw[_i]');
  lines.push('    if _e==nil then return nil end');
  lines.push('    if _e[1]==1 then rawset(_t,_i,_e[2]) return _e[2]');
  lines.push('    elseif _e[1]==0 then return nil');
  lines.push('    elseif _e[1]==2 then');
  lines.push('      local _mk='+polyMod16M('(_kk*_e[3]+_km)'));
  // ‚îÄ‚îÄ‚îÄ Layer 37 : Constant Blinding / MBA ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Mixed Boolean-Arithmetic expression (3 templates) for K table XOR
  var mbaExpr;
  if(MBA_TEMPLATE===0){
    mbaExpr='bit32.bor(_e[2],_mk)-bit32.band(_e[2],_mk)';
  }else if(MBA_TEMPLATE===1){
    mbaExpr='bit32.bor(bit32.band(_e[2],bit32.bnot(_mk)),bit32.band(bit32.bnot(_e[2]),_mk))';
  }else{
    mbaExpr='bit32.band((_e[2]+_mk)-2*bit32.band(_e[2],_mk),2147483647)';
  }
  lines.push('      local _v='+mbaExpr);
  lines.push('      rawset(_t,_i,_v) return _v');
  lines.push('    end');
  lines.push('  end})');
  lines.push('end');

  // Layer 37 : Obfuscated magic numbers (128, 32767 stored via encNum)
  var _rk128=rn();
  lines.push('local '+_rk128+'='+encNum(128));

  // ‚îÄ‚îÄ‚îÄ Layer 31 : Cell-Aware Register Helpers ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // _rget/_rset/RK transparently unwrap upvalue cells (metatable sentinel + array[1])
  var _UV_MT=rn(),_gmt=rn();
  lines.push('local '+_UV_MT+'={}');
  lines.push('local '+_gmt+'=getmetatable');
  var _rget=rn(),_rset=rn();
  lines.push('local function '+_rget+'(_R,_i)');
  lines.push('  local _v=_R[_i]');
  lines.push('  if '+_gmt+'(_v)=='+_UV_MT+' then return _v[1] end');
  lines.push('  return _v');
  lines.push('end');
  lines.push('local function '+_rset+'(_R,_i,_v)');
  lines.push('  local _c=_R[_i]');
  lines.push('  if '+_gmt+'(_c)=='+_UV_MT+' then _c[1]=_v return end');
  lines.push('  _R[_i]=_v');
  lines.push('end');
  // RK helper (cell-aware, shared ‚Äî shadowed per-execute with per-proto threshold)
  var _outerRK=rn();
  lines.push('local function '+_outerRK+'(_R,_K,_v)');
  lines.push('  if _v>='+_rk128+' then return _K[_v-'+_rk128+'+1] end');
  lines.push('  local _r=_R[_v]');
  lines.push('  if '+_gmt+'(_r)=='+_UV_MT+' then return _r[1] end');
  lines.push('  return _r');
  lines.push('end');

  // ‚îÄ‚îÄ‚îÄ Layer 56 : Dual VM ‚Äî forward-declare both execute functions ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  lines.push('local '+execNames[0]+','+execNames[1]);
  // Generate two execute functions with independent per-VM parameters
  for(var _vmi=0;_vmi<2;_vmi++){
  // Per-VM R names (regenerated each iteration)
  var FIELD_ORDER=VM[_vmi].FIELD_ORDER;
  var INV_ORDER=[0,0,0,0];
  for(var _io=0;_io<4;_io++)INV_ORDER[FIELD_ORDER[_io]]=_io;
  var AOXR=VM[_vmi].AOXR;
  var _imSeed=_imSeedNames[_vmi],_imMul=_imMulNames[_vmi];
  var _hiddenName=_hiddenNames[_vmi],_opdecName=_opdecNames[_vmi];
  R.execute=execNames[_vmi];
  // Regenerate per-execute variable names (separate from shared R.PROTO)
  ['code','K','P','REG','pc','top','inst',
   'op','a','RK',
   'upvals','varargs','nret','iterF','iterS','iterV','res',
   'tCnt','tExp2'
  ].forEach(function(n){R[n]=rn();});
  var _tExp2Enc=_tExp2EncArr[_vmi].enc;
  var TSEED2=_tExp2EncArr[_vmi].seed;
  var chainMultExpr=encNum(VM[_vmi].CHAIN_MULT);
  var chainAddExpr=encNum(VM[_vmi].CHAIN_ADD);

  lines.push(R.execute+'=function('+R.PROTO+','+R.upvals+','+R.varargs+')');
  // ‚îÄ‚îÄ‚îÄ Layer 52 : Self-Modifying Code / Code Erasure ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Clones code array at entry, zeros on RETURN/TAILCALL to prevent memory dumps
  var _clen=rn();
  lines.push('  local '+R.code+'={} local '+_clen+'=#'+R.PROTO+'[1] for _ci=1,'+_clen+' do '+R.code+'[_ci]='+R.PROTO+'[1][_ci] end');
  lines.push('  local '+R.K+'='+_decK+'('+R.PROTO+'[2],'+kEncKeyExpr+','+kEncMulExpr+')');
  lines.push('  local '+R.P+'='+R.PROTO+'[3]');
  // Per-proto RK threshold: shadows outer RK with per-function threshold from PROTO[9]
  var _rkTh=rn();
  lines.push('  local '+_rkTh+'='+R.PROTO+'[9]');
  lines.push('  local '+R.RK+'=function(_R,_K,_v)');
  lines.push('    if _v>='+_rkTh+' then return _K[_v-'+_rkTh+'+1] end');
  lines.push('    local _r=_R[_v]');
  lines.push('    if '+_gmt+'(_r)=='+_UV_MT+' then return _r[1] end');
  lines.push('    return _r');
  lines.push('  end');
  lines.push('  local '+R.REG+'={}');
  lines.push('  local '+R.pc+'=1');
  lines.push('  local '+R.top+'=0');
  // (debug tracking removed)
  // ‚îÄ‚îÄ‚îÄ Layer 53 : Execution-Trace Chaining (runtime) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Chain state + sync table loaded from PROTO[8]
  var _syncTbl=rn(),_chainVar=rn(),_chainMult=rn(),_chainAdd=rn();
  lines.push('  local '+_syncTbl+'='+R.PROTO+'[8] or {}');
  lines.push('  local '+_chainVar+'=0');
  lines.push('  local '+_chainMult+'='+chainMultExpr);
  lines.push('  local '+_chainAdd+'='+chainAddExpr);
  // ‚îÄ‚îÄ‚îÄ Layer 54 : Control Flow Flattening (runtime) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  var _succTbl=rn(),_curPC=rn();
  lines.push('  local '+_succTbl+'='+R.PROTO+'[10]');
  lines.push('  local '+_curPC+'=0');
  // Layer 26 : Anti-Tamper Layer B (per-execute counter + expected hash)
  lines.push('  local '+R.tCnt+'=0');
  lines.push('  local '+R.tExp2+'='+_tExp2Enc);
  // Load varargs into register -1 position conceptually (accessible via VARARG instruction)
  lines.push('  local _VA='+R.varargs+' or {}');
  // Load params from varargs into R[0..numparams-1]
  lines.push('  for _i=1,'+R.PROTO+'[5] do '+R.REG+'[_i-1]=_VA[_i] end');
  lines.push('  if '+R.PROTO+'[6] then');
  lines.push('    local _va2={} for _i='+R.PROTO+'[5]+1,#_VA do _va2[#_va2+1]=_VA[_i] end _VA=_va2');
  lines.push('  end');
  // ‚îÄ‚îÄ‚îÄ Jump Table Dispatch (replaces Layer 39/48 metamethod/plain function variants) ‚îÄ‚îÄ‚îÄ
  lines.push('  local '+R.inst+','+R.a);
  var _H=rn(),_rvVar=rn();
  lines.push('  local '+_H+'={}');
  var _decodeLinesStart=lines.length;
  // Layer 53 : Sync chain at jump targets, then compute IMUT key from chain state
  var _rawInst=rn(),_svTmp=rn();
  lines.push('    local '+_rawInst+'='+R.inst);
  lines.push('    local '+_svTmp+'='+_syncTbl+'['+_curPC+']');
  lines.push('    if '+_svTmp+' then '+_chainVar+'='+_svTmp+' end');
  // ‚îÄ‚îÄ‚îÄ Layer 8 : Polymorphic IR ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Non-opcode bytes XOR'd with PC-derived rolling key (chain-based)
  var _imK=rn();
  lines.push('    local '+_imK+'='+polyMod16M('('+_chainVar+'*'+_imSeed+'+'+_imMul+')'));
  // Build XOR mask: place 3 key bytes at the 3 non-opcode byte positions
  var opBytePos=FIELD_ORDER[0];
  var nonOp=[0,1,2,3].filter(function(p){return p!==opBytePos;}).sort(function(a,b){return a-b;});
  var multipliers=[1,256,65536,16777216];
  var keyExtract=[
    polyMod256(_imK),
    polyMod256(polyDiv256(_imK)),
    polyMod256(polyDiv65536(_imK))
  ];
  var maskTerms=nonOp.map(function(pos,i){
    if(multipliers[pos]===1)return keyExtract[i];
    return keyExtract[i]+'*'+multipliers[pos];
  });
  lines.push('    '+R.inst+'=bit32.bxor('+R.inst+','+maskTerms.join('+')+')');
  // (debug field tracking removed)
  // Update chain with raw encoded instruction
  lines.push('    '+_chainVar+'='+polyMod16M('('+_chainVar+'*'+_chainMult+'+'+_rawInst+'+'+_chainAdd+')'));
  // Helper: generate inline chain-based IMUT unmutation for 2-word ops
  function genImutUnmask(varName){
    var k=rn(),rawDw=rn();
    var ls=[];
    ls.push('      local '+rawDw+'='+varName);
    ls.push('      local '+k+'='+polyMod16M('('+_chainVar+'*'+_imSeed+'+'+_imMul+')'));
    var kE=[polyMod256(k),polyMod256(polyDiv256(k)),polyMod256(polyDiv65536(k))];
    var terms=nonOp.map(function(p,i){return multipliers[p]===1?kE[i]:kE[i]+'*'+multipliers[p];});
    ls.push('      '+varName+'=bit32.bxor('+varName+','+terms.join('+')+')');
    ls.push('      '+_chainVar+'='+polyMod16M('('+_chainVar+'*'+_chainMult+'+'+rawDw+'+'+_chainAdd+')'));
    return ls;
  }
  // Layer 26 : Anti-Tamper Layer B (runtime check after 500 instructions)
  lines.push('    '+R.tCnt+'='+R.tCnt+'+1');
  lines.push('    if '+R.tCnt+'==500 then');
  lines.push('      local _c2='+TSEED2);
  lines.push('      local _ks={} for _k in pairs('+_hiddenName+') do _ks[#_ks+1]=_k end table.sort(_ks)');
  lines.push('      for _,_k in ipairs(_ks) do _c2=(_c2*'+TMUL2+'+_k+1)%'+TMOD_B+' end');
  lines.push('      if _c2~=bit32.bxor('+R.tExp2+','+MASK2+') then');
  lines.push('        for _k in pairs('+_hiddenName+') do '+_hiddenName+'[_k]='+_hiddenName+'[_k]+1 end');
  lines.push('      end');
  lines.push('    end');
  // Layer 36 : Environment Locking (periodic rawequal integrity check every 1000 instructions)
  lines.push('    if '+R.tCnt+'%1000==0 and _GENV.rawequal~='+_cachedFn+' then');
  lines.push('      for _k in pairs('+_hiddenName+') do '+_hiddenName+'[_k]='+_hiddenName+'[_k]+1 end');
  lines.push('    end');
  lines.push('    local '+R.op+'='+_opdecName+'[bit32.bxor('+fieldExpr(R.inst,0)+','+AOXR+')]');
  // (debug op tracking removed)
  lines.push('    '+R.a+'='+fieldExpr(R.inst,1));
  var decodeLines=lines.splice(_decodeLinesStart);
  // Build handler array for dispatch diversification
  var handlers=[];

  // MOVE
  handlers.push({cond:R.op+'=='+BC.MOVE,body:[
    '      '+_rset+'('+R.REG+','+R.a+','+_rget+'('+R.REG+','+fieldExpr(R.inst,2)+'))'
  ]});
  // LOADK
  handlers.push({cond:R.op+'=='+BC.LOADK,body:[
    '      '+_rset+'('+R.REG+','+R.a+','+R.K+'['+fieldExpr(R.inst,2)+'+'+fieldExpr(R.inst,3)+'*256+1])'
  ]});
  // LOADBOOL
  handlers.push({cond:R.op+'=='+BC.LOADBOOL,body:[
    '      '+_rset+'('+R.REG+','+R.a+','+fieldExpr(R.inst,2)+'~=0)',
    '      if '+fieldExpr(R.inst,3)+'~=0 then '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1) end'
  ]});
  // LOADNIL
  handlers.push({cond:R.op+'=='+BC.LOADNIL,body:[
    '      for _i='+R.a+','+R.a+'+'+fieldExpr(R.inst,2)+' do '+_rset+'('+R.REG+',_i,nil) end'
  ]});
  // GETUPVAL
  handlers.push({cond:R.op+'=='+BC.GETUPVAL,body:[
    '      local _uv='+R.upvals+'['+fieldExpr(R.inst,2)+'+1]',
    '      '+_rset+'('+R.REG+','+R.a+',_uv and _uv[1])'
  ]});
  // SETUPVAL
  handlers.push({cond:R.op+'=='+BC.SETUPVAL,body:[
    '      local _uv='+R.upvals+'['+fieldExpr(R.inst,2)+'+1]',
    '      if _uv then _uv[1]='+_rget+'('+R.REG+','+R.a+') end'
  ]});
  // GETGLOBAL
  handlers.push({cond:R.op+'=='+BC.GETGLOBAL,body:[
    '      local _bx='+fieldExpr(R.inst,2)+'+'+fieldExpr(R.inst,3)+'*256',
    '      '+_rset+'('+R.REG+','+R.a+',_GENV['+R.K+'[_bx+1]])'
  ]});
  // SETGLOBAL
  handlers.push({cond:R.op+'=='+BC.SETGLOBAL,body:[
    '      local _bx='+fieldExpr(R.inst,2)+'+'+fieldExpr(R.inst,3)+'*256',
    '      _GENV['+R.K+'[_bx+1]]='+_rget+'('+R.REG+','+R.a+')'
  ]});
  // GETTABLE
  handlers.push({cond:R.op+'=='+BC.GETTABLE,body:[
    '      local _b='+fieldExpr(R.inst,2),
    '      local _c='+fieldExpr(R.inst,3),
    '      '+_rset+'('+R.REG+','+R.a+','+_rget+'('+R.REG+',_b)['+R.RK+'('+R.REG+','+R.K+',_c)])'
  ]});
  // SETTABLE
  handlers.push({cond:R.op+'=='+BC.SETTABLE,body:[
    '      local _b='+fieldExpr(R.inst,2),
    '      local _c='+fieldExpr(R.inst,3),
    '      '+_rget+'('+R.REG+','+R.a+')['+R.RK+'('+R.REG+','+R.K+',_b)]='+R.RK+'('+R.REG+','+R.K+',_c)'
  ]});
  // NEWTABLE
  handlers.push({cond:R.op+'=='+BC.NEWTABLE,body:[
    '      '+_rset+'('+R.REG+','+R.a+',{})'
  ]});
  // SELF
  handlers.push({cond:R.op+'=='+BC.SELF,body:[
    '      local _b='+fieldExpr(R.inst,2),
    '      local _c='+fieldExpr(R.inst,3),
    '      local _obj='+_rget+'('+R.REG+',_b)',
    '      '+_rset+'('+R.REG+','+R.a+'+1,_obj)',
    '      '+_rset+'('+R.REG+','+R.a+',_obj['+R.RK+'('+R.REG+','+R.K+',_c)])'
  ]});
  // Arithmetic ops
  var arithOps=[[BC.ADD,'+'],[BC.SUB,'-'],[BC.MUL,'*'],[BC.DIV,'/'],[BC.MOD,'%'],[BC.POW,'^']];
  for(var aoi=0;aoi<arithOps.length;aoi++){
    var ao=arithOps[aoi];
    handlers.push({cond:R.op+'=='+ao[0],body:[
      '      '+_rset+'('+R.REG+','+R.a+','+R.RK+'('+R.REG+','+R.K+','+fieldExpr(R.inst,2)+')'+ao[1]+R.RK+'('+R.REG+','+R.K+','+fieldExpr(R.inst,3)+'))'
    ]});
  }
  // IDIV
  handlers.push({cond:R.op+'=='+BC.IDIV,body:[
    '      '+_rset+'('+R.REG+','+R.a+',math.floor('+R.RK+'('+R.REG+','+R.K+','+fieldExpr(R.inst,2)+')/'+R.RK+'('+R.REG+','+R.K+','+fieldExpr(R.inst,3)+')))'
  ]});
  // UNM
  handlers.push({cond:R.op+'=='+BC.UNM,body:[
    '      '+_rset+'('+R.REG+','+R.a+',-'+_rget+'('+R.REG+','+fieldExpr(R.inst,2)+'))'
  ]});
  // NOT
  handlers.push({cond:R.op+'=='+BC.NOT,body:[
    '      '+_rset+'('+R.REG+','+R.a+',not '+_rget+'('+R.REG+','+fieldExpr(R.inst,2)+'))'
  ]});
  // LEN
  handlers.push({cond:R.op+'=='+BC.LEN,body:[
    '      '+_rset+'('+R.REG+','+R.a+',#'+_rget+'('+R.REG+','+fieldExpr(R.inst,2)+'))'
  ]});
  // CONCAT
  handlers.push({cond:R.op+'=='+BC.CONCAT,body:[
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      local _s='+_rget+'('+R.REG+',_b)',
    '      for _i=_b+1,_c do _s=_s..'+_rget+'('+R.REG+',_i) end',
    '      '+_rset+'('+R.REG+','+R.a+',_s)'
  ]});
  // JMP (CFF: absolute target via BX)
  handlers.push({cond:R.op+'=='+BC.JMP,body:[
    '      '+R.pc+'='+fieldExpr(R.inst,2)+'+'+fieldExpr(R.inst,3)+'*256'
  ]});
  // EQ
  handlers.push({cond:R.op+'=='+BC.EQ,body:[
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      if('+R.RK+'('+R.REG+','+R.K+',_b)=='+R.RK+'('+R.REG+','+R.K+',_c))~=('+R.a+'~=0) then '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1) end'
  ]});
  // LT
  handlers.push({cond:R.op+'=='+BC.LT,body:[
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      if('+R.RK+'('+R.REG+','+R.K+',_b)<'+R.RK+'('+R.REG+','+R.K+',_c))~=('+R.a+'~=0) then '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1) end'
  ]});
  // LE
  handlers.push({cond:R.op+'=='+BC.LE,body:[
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      if('+R.RK+'('+R.REG+','+R.K+',_b)<='+R.RK+'('+R.REG+','+R.K+',_c))~=('+R.a+'~=0) then '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1) end'
  ]});
  // TEST
  handlers.push({cond:R.op+'=='+BC.TEST,body:[
    '      local _c='+fieldExpr(R.inst,3),
    '      if(not '+_rget+'('+R.REG+','+R.a+'))==(_c~=0) then '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1) end'
  ]});
  // TESTSET
  handlers.push({cond:R.op+'=='+BC.TESTSET,body:[
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      local _bv='+_rget+'('+R.REG+',_b)',
    '      if(not _bv)==(_c~=0) then '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1) else '+_rset+'('+R.REG+','+R.a+',_bv) end'
  ]});
  // CALL
  handlers.push({cond:R.op+'=='+BC.CALL,body:[
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      local _fn='+_rget+'('+R.REG+','+R.a+')',
    '      local _na=_b==0 and('+R.top+'-'+R.a+')or(_b-1)',
    '      local _as={}',
    '      for _i=1,_na do _as[_i]='+_rget+'('+R.REG+','+R.a+'+_i) end',
    '      local _rv=table.pack(pcall(_fn,table.unpack(_as,1,_na)))',
    '      if not _rv[1] then error(_rv[2],0) end',
    '      if _c==0 then',
    '        for _i=2,_rv.n do '+_rset+'('+R.REG+','+R.a+'+_i-2,_rv[_i]) end',
    '        '+R.top+'='+R.a+'+_rv.n-2',
    '      else',
    '        for _i=1,_c-1 do '+_rset+'('+R.REG+','+R.a+'+_i-1,_rv[_i+1]) end',
    '      end'
  ]});
  // TAILCALL
  handlers.push({cond:R.op+'=='+BC.TAILCALL,body:[
    '      local _b='+fieldExpr(R.inst,2),
    '      local _fn='+_rget+'('+R.REG+','+R.a+')',
    '      local _na=_b==0 and('+R.top+'-'+R.a+')or(_b-1)',
    '      local _as={}',
    '      for _i=1,_na do _as[_i]='+_rget+'('+R.REG+','+R.a+'+_i) end',
    '      for _i=1,#'+R.code+' do '+R.code+'[_i]=0 end',
    '      return table.pack(_fn(table.unpack(_as,1,_na)))'
  ]});
  // RETURN
  handlers.push({cond:R.op+'=='+BC.RETURN,body:[
    '      local _b='+fieldExpr(R.inst,2),
    '      local _nr=_b==0 and('+R.top+'-'+R.a+'+1)or(_b-1)',
    '      if _nr<=0 then for _i=1,#'+R.code+' do '+R.code+'[_i]=0 end return {n=0} end',
    '      local _rv={n=_nr}',
    '      for _i=0,_nr-1 do _rv[_i+1]='+_rget+'('+R.REG+','+R.a+'+_i) end',
    '      for _i=1,#'+R.code+' do '+R.code+'[_i]=0 end',
    '      return _rv'
  ]});
  // FORLOOP
  handlers.push({cond:R.op+'=='+BC.FORLOOP,body:[
    '      local _step='+_rget+'('+R.REG+','+R.a+'+2)',
    '      local _nv='+_rget+'('+R.REG+','+R.a+')+_step',
    '      '+_rset+'('+R.REG+','+R.a+',_nv)',
    '      local _limit='+_rget+'('+R.REG+','+R.a+'+1)',
    '      if(_step>0 and _nv<=_limit)or(_step<0 and _nv>=_limit) then',
    '        '+R.pc+'='+fieldExpr(R.inst,2)+'+'+fieldExpr(R.inst,3)+'*256',
    '        '+_rset+'('+R.REG+','+R.a+'+3,_nv)',
    '      end'
  ]});
  // FORPREP
  handlers.push({cond:R.op+'=='+BC.FORPREP,body:[
    '      '+_rset+'('+R.REG+','+R.a+','+_rget+'('+R.REG+','+R.a+')-'+_rget+'('+R.REG+','+R.a+'+2))',
    '      '+R.pc+'='+fieldExpr(R.inst,2)+'+'+fieldExpr(R.inst,3)+'*256'
  ]});
  // TFORCALL
  handlers.push({cond:R.op+'=='+BC.TFORCALL,body:[
    '      local _c='+fieldExpr(R.inst,3),
    '      local _rv=table.pack('+_rget+'('+R.REG+','+R.a+')('+_rget+'('+R.REG+','+R.a+'+1),'+_rget+'('+R.REG+','+R.a+'+2)))',
    '      for _i=1,_c do '+_rset+'('+R.REG+','+R.a+'+2+_i,_rv[_i]) end'
  ]});
  // TFORLOOP
  handlers.push({cond:R.op+'=='+BC.TFORLOOP,body:[
    '      local _v1='+_rget+'('+R.REG+','+R.a+'+1)',
    '      if _v1~=nil then',
    '        '+_rset+'('+R.REG+','+R.a+',_v1)',
    '        '+R.pc+'='+fieldExpr(R.inst,2)+'+'+fieldExpr(R.inst,3)+'*256',
    '      end'
  ]});
  // SETLIST
  handlers.push({cond:R.op+'=='+BC.SETLIST,body:[
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      local _off=(_c-1)*50',
    '      local _nb=_b==0 and('+R.top+'-'+R.a+')or _b',
    '      local _tbl='+_rget+'('+R.REG+','+R.a+')',
    '      for _i=1,_nb do _tbl[_off+_i]='+_rget+'('+R.REG+','+R.a+'+_i) end'
  ]});
  // Layer 29 : Per-Proto Rolling XOR (runtime decrypt on first CLOSURE)
  // Layer 30 : Upvalue Cell Encoding ({val=X, __uv=true})
  handlers.push({cond:R.op+'=='+BC.CLOSURE,body:[
    '      local _bx='+fieldExpr(R.inst,2)+'+'+fieldExpr(R.inst,3)+'*256',
    '      local _sp='+R.P+'[_bx+1]',
    '      if type(_sp)=="string" then',
    '        local _dk='+polyMod16M('('+_fkName+'*(_bx+1)+'+_fmName+')')+'',
    '        local _db={}',
    '        for _i=1,#_sp do',
    '          local _pb=bit32.bxor(string.byte(_sp,_i),'+polyMod256('_dk')+')',
    '          _db[_i]=string.char(_pb)',
    '          _dk='+polyMod16M('(_dk*31+_pb+'+_faName+')')+'',
    '        end',
    '        _sp=(load or loadstring)(table.concat(_db))()('+R.S+')',
    '        '+R.P+'[_bx+1]=_sp',
    '      end',
    '      local _su={}',
    '      if _sp[4] then',
    '        for _i,_d in ipairs(_sp[4]) do',
    '          if _d[1]==1 then',
    '            if '+_gmt+'('+R.REG+'[_d[2]])~='+_UV_MT+' then',
    '              '+R.REG+'[_d[2]]=setmetatable({'+R.REG+'[_d[2]]},'+_UV_MT+')',
    '            end',
    '            _su[_i]='+R.REG+'[_d[2]]',
    '          else',
    '            _su[_i]='+R.upvals+'[_d[2]+1]',
    '          end',
    '        end',
    '      end',
    '      local _exec=_sp[12]==0 and '+execNames[0]+' or '+execNames[1],
    '      '+_rset+'('+R.REG+','+R.a+',function(...)',
    '        local _xr=table.pack(pcall(_exec,_sp,_su,{...}))',
    '        if not _xr[1] then error(_xr[2],0) end',
    '        return table.unpack(_xr,2,_xr.n)',
    '      end)'
  ]});
  // VARARG
  handlers.push({cond:R.op+'=='+BC.VARARG,body:[
    '      local _b='+fieldExpr(R.inst,2),
    '      if _b==0 then',
    '        for _i=1,#_VA do '+_rset+'('+R.REG+','+R.a+'+_i-1,_VA[_i]) end',
    '        '+R.top+'='+R.a+'+#_VA-1',
    '      else',
    '        for _i=1,_b-1 do '+_rset+'('+R.REG+','+R.a+'+_i-1,_VA[_i]) end',
    '      end'
  ]});
  // Bitwise ops
  var bitOps=[[BC.BAND,'bit32.band'],[BC.BOR,'bit32.bor'],[BC.BXOR,'bit32.bxor'],[BC.SHL,'bit32.lshift'],[BC.SHR,'bit32.rshift']];
  for(var boi=0;boi<bitOps.length;boi++){
    var bo=bitOps[boi];
    handlers.push({cond:R.op+'=='+bo[0],body:[
      '      '+_rset+'('+R.REG+','+R.a+','+bo[1]+'('+R.RK+'('+R.REG+','+R.K+','+fieldExpr(R.inst,2)+'),'+R.RK+'('+R.REG+','+R.K+','+fieldExpr(R.inst,3)+')))'
    ]});
  }
  // BNOT
  handlers.push({cond:R.op+'=='+BC.BNOT,body:[
    '      '+_rset+'('+R.REG+','+R.a+',bit32.bnot('+_rget+'('+R.REG+','+fieldExpr(R.inst,2)+')))'
  ]});
  // ‚îÄ‚îÄ‚îÄ Layer 32 : CLOSE Instruction ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Unboxes upvalue cells from R[a] to R[maxstack] at scope exit
  handlers.push({cond:R.op+'=='+BC.CLOSE,body:[
    '      for _i='+R.a+','+R.PROTO+'[7] do local _c='+R.REG+'[_i]',
    '        if '+_gmt+'(_c)=='+_UV_MT+' then '+R.REG+'[_i]=_c[1] end',
    '      end'
  ]});

  // Layer 38 : Superoperator handlers (SUPER_MRET, SUPER_KRET, SUPER_GCALL)
  // SUPER_MRET: MOVE + RETURN(B=2) fused
  handlers.push({cond:R.op+'=='+BC.SUPER_MRET,body:[
    '      local _mr='+_rget+'('+R.REG+','+fieldExpr(R.inst,2)+')',
    '      for _i=1,#'+R.code+' do '+R.code+'[_i]=0 end',
    '      return {_mr,n=1}'
  ]});
  // SUPER_KRET: LOADK + RETURN(B=2) fused
  handlers.push({cond:R.op+'=='+BC.SUPER_KRET,body:[
    '      local _kr='+R.K+'['+fieldExpr(R.inst,2)+'+'+fieldExpr(R.inst,3)+'*256+1]',
    '      for _i=1,#'+R.code+' do '+R.code+'[_i]=0 end',
    '      return {_kr,n=1}'
  ]});
  // SUPER_GCALL: GETGLOBAL + CALL fused
  var sgImut=genImutUnmask('_dw');
  handlers.push({cond:R.op+'=='+BC.SUPER_GCALL,body:[
    '      local _dw='+R.code+'['+R.pc+']',
    '      '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1)',
  ].concat(sgImut).concat([
    '      local _bx='+fieldExpr('_dw',2)+'+'+fieldExpr('_dw',3)+'*256',
    '      local _fn=_GENV['+R.K+'[_bx+1]]',
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      local _na=_b==0 and('+R.top+'-'+R.a+')or(_b-1)',
    '      local _as={}',
    '      for _i=1,_na do _as[_i]='+_rget+'('+R.REG+','+R.a+'+_i) end',
    '      local _rv=table.pack(pcall(_fn,table.unpack(_as,1,_na)))',
    '      if not _rv[1] then error(_rv[2],0) end',
    '      if _c==0 then',
    '        for _i=2,_rv.n do '+_rset+'('+R.REG+','+R.a+'+_i-2,_rv[_i]) end',
    '        '+R.top+'='+R.a+'+_rv.n-2',
    '      else',
    '        for _i=1,_c-1 do '+_rset+'('+R.REG+','+R.a+'+_i-1,_rv[_i+1]) end',
    '      end'
  ])});

  // ‚îÄ‚îÄ‚îÄ Layer 55 : Extended Superoperator handlers (SUPER_SELF_CALL, SUPER_TEST_JMP, SUPER_GETTAB_CALL)
  // SUPER_SELF_CALL: SELF + CALL fused (2-word)
  var sscImut=genImutUnmask('_dw');
  handlers.push({cond:R.op+'=='+BC.SUPER_SELF_CALL,body:[
    '      local _dw='+R.code+'['+R.pc+']',
    '      '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1)',
  ].concat(sscImut).concat([
    '      local _selfB='+fieldExpr('_dw',2),
    '      local _selfC='+fieldExpr('_dw',3),
    '      local _obj='+_rget+'('+R.REG+',_selfB)',
    '      '+_rset+'('+R.REG+','+R.a+'+1,_obj)',
    '      '+_rset+'('+R.REG+','+R.a+',_obj['+R.RK+'('+R.REG+','+R.K+',_selfC)])',
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      local _fn='+_rget+'('+R.REG+','+R.a+')',
    '      local _na=_b==0 and('+R.top+'-'+R.a+')or(_b-1)',
    '      local _as={}',
    '      for _i=1,_na do _as[_i]='+_rget+'('+R.REG+','+R.a+'+_i) end',
    '      local _rv=table.pack(pcall(_fn,table.unpack(_as,1,_na)))',
    '      if not _rv[1] then error(_rv[2],0) end',
    '      if _c==0 then',
    '        for _i=2,_rv.n do '+_rset+'('+R.REG+','+R.a+'+_i-2,_rv[_i]) end',
    '        '+R.top+'='+R.a+'+_rv.n-2',
    '      else',
    '        for _i=1,_c-1 do '+_rset+'('+R.REG+','+R.a+'+_i-1,_rv[_i+1]) end',
    '      end'
  ])});
  // SUPER_TEST_JMP: TEST + JMP fused (2-word, conditional jump)
  var stjImut=genImutUnmask('_dw');
  handlers.push({cond:R.op+'=='+BC.SUPER_TEST_JMP,body:[
    '      local _dw='+R.code+'['+R.pc+']',
    '      '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1)',
  ].concat(stjImut).concat([
    '      local _bx='+fieldExpr('_dw',2)+'+'+fieldExpr('_dw',3)+'*256',
    '      local _c='+fieldExpr(R.inst,2),
    '      if(not '+_rget+'('+R.REG+','+R.a+'))~=(_c~=0) then '+R.pc+'=_bx end'
  ])});
  // SUPER_GETTAB_CALL: GETTABLE + CALL fused (2-word)
  var gtcImut=genImutUnmask('_dw');
  handlers.push({cond:R.op+'=='+BC.SUPER_GETTAB_CALL,body:[
    '      local _dw='+R.code+'['+R.pc+']',
    '      '+R.pc+'='+_succTbl+'['+R.pc+'] or('+R.pc+'+1)',
  ].concat(gtcImut).concat([
    '      local _gtB='+fieldExpr('_dw',2),
    '      local _gtC='+fieldExpr('_dw',3),
    '      '+_rset+'('+R.REG+','+R.a+','+_rget+'('+R.REG+',_gtB)['+R.RK+'('+R.REG+','+R.K+',_gtC)])',
    '      local _b='+fieldExpr(R.inst,2)+' local _c='+fieldExpr(R.inst,3),
    '      local _fn='+_rget+'('+R.REG+','+R.a+')',
    '      local _na=_b==0 and('+R.top+'-'+R.a+')or(_b-1)',
    '      local _as={}',
    '      for _i=1,_na do _as[_i]='+_rget+'('+R.REG+','+R.a+'+_i) end',
    '      local _rv=table.pack(pcall(_fn,table.unpack(_as,1,_na)))',
    '      if not _rv[1] then error(_rv[2],0) end',
    '      if _c==0 then',
    '        for _i=2,_rv.n do '+_rset+'('+R.REG+','+R.a+'+_i-2,_rv[_i]) end',
    '        '+R.top+'='+R.a+'+_rv.n-2',
    '      else',
    '        for _i=1,_c-1 do '+_rset+'('+R.REG+','+R.a+'+_i-1,_rv[_i+1]) end',
    '      end'
  ])});

  // ‚îÄ‚îÄ‚îÄ Layer 20 : Dead Code Handlers ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // 5-8 unreachable branches with opaque-false conditions
  var nDead=5+Math.floor(Math.random()*4);
  for(var di=0;di<nDead;di++){
    if(di===0){
      handlers.push({cond:genOpaqueFalse(),body:[
        '      local '+rn()+'='+R.S+'['+watermarkIdx+']'
      ]});
    }else{
      handlers.push({cond:genOpaqueFalse(),body:[
        '      local '+rn()+'='+Math.floor(Math.random()*9999)
      ]});
    }
  }

  // ‚îÄ‚îÄ‚îÄ Layer 21 : Noop Local Injection ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // ~80% of handlers get dummy locals with opaque-true values
  for(var hi=0;hi<handlers.length;hi++){
    if(Math.random()<0.8){
      handlers[hi].body.unshift('      local '+rn()+'='+genOpaqueTrue());
    }
  }

  // ‚îÄ‚îÄ‚îÄ Layer 19 : Handler Diversification ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Fisher-Yates shuffle of all dispatch handlers per build
  shuffle(handlers);

  // Emit jump table handlers
  for(var hi=0;hi<handlers.length;hi++){
    var h=handlers[hi];
    var prefix=R.op+'==';
    if(h.cond.indexOf(prefix)===0){
      var opcodeVal=h.cond.substring(prefix.length);
      lines.push('  '+_H+'['+opcodeVal+']=function()');
      for(var li=0;li<h.body.length;li++) lines.push(h.body[li]);
      lines.push('  end');
    }else{
      // Dead code handler (opaque false condition) ‚Äî emit at unreachable index for anti-analysis
      lines.push('  '+_H+'['+(200+hi)+']=function()');
      for(var li=0;li<h.body.length;li++) lines.push(h.body[li]);
      lines.push('  end');
    }
  }
  // Main loop ‚Äî jump table dispatch
  // Layer 54 CFF: start at PROTO[11] (startPC), advance via successor table PROTO[10]
  lines.push('  '+R.pc+'='+R.PROTO+'[11] or 1');
  lines.push('  while true do');
  lines.push('    '+_curPC+'='+R.pc);
  lines.push('    '+R.inst+'='+R.code+'['+R.pc+']');
  lines.push('    '+R.pc+'=('+_succTbl+' and '+_succTbl+'['+R.pc+']) or('+R.pc+'+1)');
  for(var di=0;di<decodeLines.length;di++) lines.push(decodeLines[di]);
  var _hVar=rn();
  lines.push('    local '+_hVar+'='+_H+'['+R.op+']');
  lines.push('    if '+_hVar+' then');
  lines.push('      local '+_rvVar+'='+_hVar+'()');
  lines.push('      if '+_rvVar+'~=nil then return table.unpack('+_rvVar+',1,'+_rvVar+'.n) end');
  lines.push('    end');
  lines.push('  end');
  lines.push('end');
  } // end Layer 56 dual VM loop

  // Execute the root prototype ‚Äî route based on PROTO[12] vmId
  lines.push('if '+R.PROTO+'[12]==0 then '+execNames[0]+'('+R.PROTO+',{},{}) else '+execNames[1]+'('+R.PROTO+',{},{}) end');

  // ‚îÄ‚îÄ‚îÄ Layer 35 : Build Watermark ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Per-build BUILD_ID + BUILD_TS for leak tracing (referenced in dead handler)
  lines.push('local '+rn()+'='+encNum(BUILD_ID));

  var innerLines=lines.join('\n');

  // ‚îÄ‚îÄ‚îÄ Layer 23 : Reference Indirection Table (RT) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // All stdlib calls ‚Üí _RT[randomKey] lookups
  var sortedStdlib=STDLIB.slice().sort(function(a,b){return b.length-a.length;});
  for(var ri=0;ri<sortedStdlib.length;ri++){
    var name=sortedStdlib[ri];
    var escaped=name.replace(/\./g,'\\.');
    var re=new RegExp('\\b'+escaped+'\\b','g');
    innerLines=innerLines.replace(re,R.RT+'['+rtKeys[name]+']');
  }
  // ‚îÄ‚îÄ‚îÄ Layer 42 : RT Table Anti-Fingerprinting ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Stdlib assignments shuffled per build, interleaved with opaque-predicate dummy locals
  var shuffledStdlib=STDLIB.slice();
  shuffle(shuffledStdlib);
  var rtInitLines=['local '+R.RT+'={}'];
  // Split into 4-6 groups with dummy locals between them
  var rtGroupCount=Math.floor(Math.random()*3)+4;
  var perGroup=Math.ceil(shuffledStdlib.length/rtGroupCount);
  for(var rg=0;rg<shuffledStdlib.length;rg++){
    rtInitLines.push(R.RT+'['+rtKeys[shuffledStdlib[rg]]+']='+shuffledStdlib[rg]);
    // Insert dummy local between groups
    if((rg+1)%perGroup===0 && rg<shuffledStdlib.length-1){
      rtInitLines.push('local '+rn()+'='+genOpaqueTrue());
    }
  }
  innerLines=rtInitLines.join('\n')+'\n'+innerLines;

  // ‚îÄ‚îÄ‚îÄ Layer 50 : Outer-Scope getfenv Override ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // getfenv/setfenv locked in LZW wrapper before inner payload decode
  var outerEnvLines=[
    'local _GE=getgenv and getgenv() or _G',
    'pcall(function() _GE.getfenv=function() return _GE end end)',
    'pcall(function() _GE.setfenv=function() end end)'
  ];

  // ‚îÄ‚îÄ‚îÄ Layer 33 : Double Loadstring Wrapping ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Defers compilation to runtime via LZW+loadstring or load([=[...]=])
  var compressed=lzwCompress(innerLines);
  var b64=bytesToBase64(compressed);
  var decompOverhead=900;
  if(b64.length+decompOverhead<innerLines.length*0.85){
    return lzwDecompressorLua(b64,outerEnvLines);
  }

  // Fallback: uncompressed wrap in load([=[...]=])
  var lvl=0;
  while(innerLines.includes(']'+'='.repeat(lvl)+']'))lvl++;
  var open='['+'='.repeat(lvl)+'[';
  var close=']'+'='.repeat(lvl)+']';

  var fallbackLines=outerEnvLines.slice();
  fallbackLines.push('local _ls=load or loadstring');
  fallbackLines.push('if not _ls then return end');
  fallbackLines.push('local _fn,_err=_ls('+open);
  fallbackLines.push(innerLines);
  fallbackLines.push(close+')');
  fallbackLines.push('if not _fn then print("LOADSTRING FAIL: "..tostring(_err)) return end');
  fallbackLines.push('local _ok,_e=pcall(_fn)');
  fallbackLines.push('if not _ok then print("RUNTIME ERROR: "..tostring(_e)) end');
  return fallbackLines.join('\n');
}

// ‚îÄ‚îÄ‚îÄ Layer 34 : LZW + Base64 Compression ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Skipped if savings < 15%
function lzwCompress(input){
  var dict={},dictSize=256;
  for(var i=0;i<256;i++)dict[String.fromCharCode(i)]=i;
  var w='',result=[];
  for(var i=0;i<input.length;i++){
    var wc=w+input[i];
    if(dict[wc]!==undefined){w=wc;}
    else{result.push(dict[w]);if(dictSize<65536)dict[wc]=dictSize++;w=input[i];}
  }
  if(w)result.push(dict[w]);
  var bytes=[];
  for(var i=0;i<result.length;i++){
    bytes.push(result[i]&0xFF);
    bytes.push((result[i]>>8)&0xFF);
  }
  return bytes;
}

function bytesToBase64(bytes){
  var chunk=8192,s='';
  for(var i=0;i<bytes.length;i+=chunk){
    s+=String.fromCharCode.apply(null,bytes.slice(i,Math.min(i+chunk,bytes.length)));
  }
  return btoa(s);
}

// ‚îÄ‚îÄ‚îÄ Layer 43 : LZW Decompressor Polymorphism ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// 3 structural variants per build: multiplication, bit32 shifts, accumulator
function lzwDecompressorLua(b64,outerEnvLines){
  var _lzwUsed=new Set();
  function ln(){
    var pool='lLiI1';var s;
    do{s='_';var len=5+Math.floor(Math.random()*5);
      for(var i=0;i<len;i++)s+=pool[Math.floor(Math.random()*pool.length)];
    }while(_lzwUsed.has(s));
    _lzwUsed.add(s);return s;
  }
  var variant=Math.floor(Math.random()*3);
  var _ls=ln(),_cd=ln(),_b64=ln(),_b64d=ln(),_bd=ln(),_bn=ln();
  var _a=ln(),_b=ln(),_c=ln(),_d=ln(),_v=ln(),_i=ln();
  var _cb=ln(),_pad=ln(),_dt=ln(),_ds=ln(),_di=ln(),_w=ln();
  var _out=ln(),_oc=ln(),_code=ln(),_entry=ln(),_src=ln(),_fn=ln(),_err=ln(),_ok=ln(),_e=ln();
  var lines=[];
  lines.push('local '+_ls+'=load or loadstring');
  lines.push('if not '+_ls+' then return end');
  // Outer env lines (getfenv/setfenv override) inserted before payload decode
  if(outerEnvLines){for(var oe=0;oe<outerEnvLines.length;oe++)lines.push(outerEnvLines[oe]);}
  lines.push('local '+_cd+'="'+b64+'"');
  // Base64 decode ‚Äî 3 structural variants
  if(variant===0){
    // Variant A: multiplication-based, for-loop lookup build
    lines.push('local '+_b64+'="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"');
    lines.push('local '+_b64d+'={}');
    lines.push('for '+_i+'=1,64 do '+_b64d+'[string.byte('+_b64+','+_i+')]='+_i+'-1 end');
    lines.push('local '+_bd+'={}');
    lines.push('local '+_bn+'=0');
    lines.push('for '+_i+'=1,#'+_cd+',4 do');
    lines.push('local '+_a+'='+_b64d+'[string.byte('+_cd+','+_i+')] or 0');
    lines.push('local '+_b+'='+_b64d+'[string.byte('+_cd+','+_i+'+1)] or 0');
    lines.push('local '+_c+'='+_b64d+'[string.byte('+_cd+','+_i+'+2)] or 0');
    lines.push('local '+_d+'='+_b64d+'[string.byte('+_cd+','+_i+'+3)] or 0');
    lines.push('local '+_v+'='+_a+'*262144+'+_b+'*4096+'+_c+'*64+'+_d);
    lines.push(_bn+'='+_bn+'+1');
    lines.push(_bd+'['+_bn+']=string.char(math.floor('+_v+'/65536),math.floor('+_v+'/256)%256,'+_v+'%256)');
    lines.push('end');
  }else if(variant===1){
    // Variant B: bit32 shift-based, gmatch lookup build
    lines.push('local '+_b64+'="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"');
    lines.push('local '+_b64d+'={}');
    var _ch=ln(),_pos=ln();
    lines.push('do local '+_pos+'=0 for '+_ch+' in string.gmatch('+_b64+',".")');
    lines.push('do '+_b64d+'[string.byte('+_ch+')]='+_pos+' '+_pos+'='+_pos+'+1 end end');
    lines.push('local '+_bd+'={}');
    lines.push('local '+_bn+'=0');
    lines.push('for '+_i+'=1,#'+_cd+',4 do');
    lines.push('local '+_a+'='+_b64d+'[string.byte('+_cd+','+_i+')] or 0');
    lines.push('local '+_b+'='+_b64d+'[string.byte('+_cd+','+_i+'+1)] or 0');
    lines.push('local '+_c+'='+_b64d+'[string.byte('+_cd+','+_i+'+2)] or 0');
    lines.push('local '+_d+'='+_b64d+'[string.byte('+_cd+','+_i+'+3)] or 0');
    lines.push('local '+_v+'=bit32.bor(bit32.lshift('+_a+',18),bit32.lshift('+_b+',12),bit32.lshift('+_c+',6),'+_d+')');
    lines.push(_bn+'='+_bn+'+1');
    lines.push(_bd+'['+_bn+']=string.char(bit32.rshift('+_v+',16),bit32.band(bit32.rshift('+_v+',8),255),bit32.band('+_v+',255))');
    lines.push('end');
  }else{
    // Variant C: accumulator-based, string.char accumulation
    lines.push('local '+_b64+'="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"');
    lines.push('local '+_b64d+'={}');
    lines.push('for '+_i+'=1,#'+_b64+' do '+_b64d+'[string.sub('+_b64+','+_i+','+_i+')]='+_i+'-1 end');
    lines.push('local '+_bd+'={}');
    lines.push('local '+_bn+'=0');
    lines.push('for '+_i+'=1,#'+_cd+',4 do');
    lines.push('local '+_v+'='+_b64d+'[string.sub('+_cd+','+_i+','+_i+')] or 0');
    lines.push(_v+'='+_v+'*64+('+_b64d+'[string.sub('+_cd+','+_i+'+1,'+_i+'+1)] or 0)');
    lines.push(_v+'='+_v+'*64+('+_b64d+'[string.sub('+_cd+','+_i+'+2,'+_i+'+2)] or 0)');
    lines.push(_v+'='+_v+'*64+('+_b64d+'[string.sub('+_cd+','+_i+'+3,'+_i+'+3)] or 0)');
    lines.push(_bn+'='+_bn+'+1');
    lines.push(_bd+'['+_bn+']=string.char(math.floor('+_v+'/65536),math.floor('+_v+'/256)%256,'+_v+'%256)');
    lines.push('end');
  }
  lines.push('local '+_cb+'=table.concat('+_bd+')');
  lines.push('local '+_pad+'=0');
  lines.push('if string.byte('+_cd+',#'+_cd+')==61 then '+_pad+'='+_pad+'+1 end');
  lines.push('if #'+_cd+'>1 and string.byte('+_cd+',#'+_cd+'-1)==61 then '+_pad+'='+_pad+'+1 end');
  lines.push('if '+_pad+'>0 then '+_cb+'=string.sub('+_cb+',1,#'+_cb+'-'+_pad+') end');
  // LZW decompress ‚Äî shared across variants (different var names already provide variation)
  lines.push('local '+_dt+'={}');
  lines.push('for '+_i+'=0,255 do '+_dt+'['+_i+']=string.char('+_i+') end');
  lines.push('local '+_ds+'=256');
  lines.push('local '+_di+'=1');
  lines.push('local '+_w+'=nil');
  lines.push('local '+_out+'={}');
  lines.push('local '+_oc+'=0');
  lines.push('while '+_di+'<#'+_cb+' do');
  lines.push('local '+_code+'=string.byte('+_cb+','+_di+')+string.byte('+_cb+','+_di+'+1)*256');
  lines.push(_di+'='+_di+'+2');
  lines.push('local '+_entry);
  lines.push('if '+_dt+'['+_code+'] then '+_entry+'='+_dt+'['+_code+']');
  lines.push('elseif '+_code+'=='+_ds+' and '+_w+' then '+_entry+'='+_w+'..string.sub('+_w+',1,1)');
  lines.push('else break end');
  lines.push(_oc+'='+_oc+'+1');
  lines.push(_out+'['+_oc+']='+_entry);
  lines.push('if '+_w+' and '+_ds+'<65536 then');
  lines.push(_dt+'['+_ds+']='+_w+'..string.sub('+_entry+',1,1)');
  lines.push(_ds+'='+_ds+'+1');
  lines.push('end');
  lines.push(_w+'='+_entry);
  lines.push('end');
  lines.push('local '+_src+'=table.concat('+_out+')');
  lines.push('local '+_fn+','+_err+'='+_ls+'('+_src+')');
  lines.push('if not '+_fn+' then print("LOADSTRING FAIL: "..tostring('+_err+')) return end');
  lines.push('local '+_ok+','+_e+'=pcall('+_fn+')');
  lines.push('if not '+_ok+' then print("RUNTIME ERROR: "..tostring('+_e+')) end');
  return lines.join('\n');
}

// ‚îÄ‚îÄ‚îÄ BYTECODE ENTRY POINT ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
function obfuscateBytecodeVM(src){
  var tokens=tokenize(src);
  var ast=parse(tokens);
  // Layer 35 : Build Watermark (BUILD_ID + BUILD_TS)
  var BUILD_ID=Math.floor(Math.random()*0xFFFFFFFF);
  var BUILD_TS=new Date().toISOString().slice(0,19).replace('T',' ');
  // Layer 37 : Constant Blinding / MBA template selection
  var MBA_TEMPLATE=Math.floor(Math.random()*3);
  // Compile AST to prototype
  var proto=bcCompileTopLevel(ast);
  // Fix RK encoding for functions with maxstack > 128
  fixRKEncoding(proto);
  // Fuse common instruction sequences into superoperators
  fuseInstructions(proto);
  // Inject garbage bytecode (dead instructions + opaque branches)
  injectGarbage(proto);
  // Control flow flattening (permute code, successor table, absolute jumps)
  controlFlowFlattening(proto);
  // ‚îÄ‚îÄ‚îÄ Layer 56 : Dual VM Architecture ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Assign each prototype to VM-0 or VM-1 randomly
  function assignVmIds(p){p.vmId=Math.floor(Math.random()*2);for(var i=0;i<p.p.length;i++)assignVmIds(p.p[i]);}
  assignVmIds(proto);
  // String dedup
  var _strMap=new Map(),_strArr=[];
  function encStr(s){
    if(!_strMap.has(s)){_strMap.set(s,_strArr.length+1);_strArr.push(s);}
    return'_SS['+_strMap.get(s)+']';
  }
  encStr(BUILD_TS);
  var watermarkIdx=_strArr.length;
  function rand(lo,hi){return Math.floor(Math.random()*(hi-lo+1))+lo;}
  // ‚îÄ‚îÄ‚îÄ Layer 17 : Polymorphic Number Encoding ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // 6 templates: XOR, add/sub, double-XOR, floor/div, band/bor, lshift/rshift
  function encNum(n,depth){
    if(!isFinite(n))return n>0?'(1/0)':'-(1/0)';
    if(n===0)return'0';
    depth=depth||0;
    if(n!==Math.floor(n)&&depth<1){
      var s=String(n).split('.')[1]||'';
      var scale=Math.pow(10,s.length);
      return'('+encNum(Math.round(n*scale),depth+1)+'/'+scale+')';
    }
    if(n<0)return'(-'+encNum(-n,depth)+')';
    if(n>0x7FFFFFFF){
      var k=rand(2,17);
      if(isFinite(n*k)){return'math.floor('+(n*k+rand(0,k-1))+'/'+k+')';}
      var k2=rand(50,250);return'('+(n+k2)+'-'+k2+')';
    }
    var template=Math.floor(Math.random()*6);
    switch(template){
      case 0:{var k=rand(1,0xFFFF);return'bit32.bxor('+(n^k)+','+k+')';}
      case 1:{var k=rand(50,5000);return'('+(n+k)+'-'+k+')';}
      case 2:{var k1=rand(1,0xFF),k2=rand(1,0xFF);return'bit32.bxor(bit32.bxor('+((n^k1)^k2)+','+k1+'),'+k2+')';}
      case 3:{var k=rand(2,17);return'math.floor('+(n*k+rand(0,k-1))+'/'+k+')';}
      case 4:{return'bit32.band(bit32.bor('+n+',0),'+0xFFFFFFFF+')';}
      case 5:{
        if(n<0x1000000){var s=rand(1,8);return'bit32.rshift(bit32.lshift('+n+','+s+'),'+s+')';}
        var k=rand(1,0xFFFF);return'bit32.bxor('+(n^k)+','+k+')';
      }
    }
  }
  // ‚îÄ‚îÄ‚îÄ Layer 56 : Dual VM ‚Äî Two independent parameter sets ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  var VM=[];
  for(var _vi=0;_vi<2;_vi++){
    var fo=[0,1,2,3];
    for(var _f=3;_f>0;_f--){var _fj=Math.floor(Math.random()*(_f+1));var _ft=fo[_f];fo[_f]=fo[_fj];fo[_fj]=_ft;}
    VM.push({
      OPMAP:genBytecodeOpcodeMap(),
      FIELD_ORDER:fo,
      AOXR:Math.floor(Math.random()*253)+1,
      IMUT_SEED:Math.floor(Math.random()*0xFFFFFF)+1,
      IMUT_MUL:Math.floor(Math.random()*0xFFFFFF)+1,
      CHAIN_SEED:Math.floor(Math.random()*0xFFFFFF)+1,
      CHAIN_MULT:(Math.floor(Math.random()*126)+1)*2+1,
      CHAIN_ADD:Math.floor(Math.random()*254)+1
    });
  }
  // ‚îÄ‚îÄ‚îÄ Layer 18 : K Table Lazy Encryption (build-time keys, shared) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  var KENC_KEY=Math.floor(Math.random()*0xFFFF)+1;
  var KENC_MUL=Math.floor(Math.random()*900)+100;
  var FENC_KEY=Math.floor(Math.random()*0xFFFFFF)+1;
  var FENC_MUL=Math.floor(Math.random()*900)+100;
  var FENC_ADD=Math.floor(Math.random()*254)+1;
  var protoStr=bcSerializePrototype(proto,encStr,encNum,VM,KENC_KEY,KENC_MUL,FENC_KEY,FENC_MUL,FENC_ADD);
  var kEncKeyExpr=encNum(KENC_KEY);
  var kEncMulExpr=encNum(KENC_MUL);
  var fencKeyExpr=encNum(FENC_KEY);
  var fencMulExpr=encNum(FENC_MUL);
  var fencAddExpr=encNum(FENC_ADD);
  // ‚îÄ‚îÄ‚îÄ Layer 23 : Reference Indirection Table (build-time keys) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  var STDLIB=[
    'bit32.bxor','bit32.band','bit32.bor','bit32.bnot','bit32.rshift','bit32.lshift',
    'table.pack','table.unpack','table.concat','table.sort',
    'string.byte','string.char','math.floor',
    'setmetatable','getmetatable','type','tostring','ipairs','pairs',
    'pcall','error','rawset','rawget','select'
  ];
  var rtKeys={};
  var usedRTKeys=new Set();
  for(var si=0;si<STDLIB.length;si++){
    var k;do{k=Math.floor(Math.random()*200)+1;}while(usedRTKeys.has(k));
    usedRTKeys.add(k);rtKeys[STDLIB[si]]=k;
  }
  return generateBytecodeVM(VM,protoStr,_strArr,STDLIB,rtKeys,kEncKeyExpr,kEncMulExpr,fencKeyExpr,fencMulExpr,fencAddExpr,BUILD_ID,watermarkIdx,MBA_TEMPLATE,encNum);
}

// ─── Export interface ──────────────────────────────────────────
export function obfuscate(sourceCode) {
  const trimmed = String(sourceCode || '').trim();
  if (!trimmed) throw new Error('Source code is empty.');
  if (trimmed.length > 500000) throw new Error('Source code exceeds 500KB.');
  return obfuscateBytecodeVM(trimmed);
}