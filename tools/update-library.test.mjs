import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../scripts/github.com/update-anime-library.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function run({library={anime:[]},episodes=[],confirmValue=true,conflict=false,origin='https://github.com'}={}){
  const calls=[];let submit;
  const form={elements:{title:{value:'Test Anime'},json:{value:JSON.stringify({episodes})},token:{value:'TEST_TOKEN'}},addEventListener:(_,fn)=>{submit=fn;}};
  const dialog={style:{},setAttribute(){},querySelector:s=>s==='form'?form:{},addEventListener(){},remove(){},showModal(){queueMicrotask(()=>submit({preventDefault(){},currentTarget:form}));}};
  const document={querySelector:()=>null,createElement:()=>dialog,body:{append(){}}};
  const fetch=async(url,options)=>{
    calls.push({url,...options});
    if(options.method==='GET')return {ok:true,json:async()=>({sha:'original-sha',encoding:'base64',content:Buffer.from(JSON.stringify(library)).toString('base64')})};
    if(conflict)return {ok:false,status:409};
    return {ok:true,json:async()=>({content:{html_url:'https://github.com/test/file'},commit:{html_url:'https://github.com/test/commit'}})};
  };
  const invoke=new AsyncFunction('location','document','fetch','confirm',source);
  const result=await invoke({origin},document,fetch,()=>confirmValue);
  const write=calls.find(c=>c.method==='PUT');
  return {result,calls,body:write?JSON.parse(write.body):null,library:write?JSON.parse(Buffer.from(JSON.parse(write.body).content,'base64').toString('utf8')):null};
}
const episode=(number,url='https://dood.to/e/new')=>({number,title:`الحلقة ${number}`,links:[{label:'Dood FHD',url}]});
test('Merges padded episode numbers and preserves shows, links and metadata',async()=>{
  const existing={anime:[{title:'Test Anime',custom:'keep',episodes:[{number:'01',title:'الحلقة 1',links:[{url:'https://old.example/video',quality:'FHD'}]}]},{title:'Other',episodes:[]}]};
  const out=await run({library:existing,episodes:[episode(1),episode(2)]});
  assert.equal(out.library.anime.length,2);assert.equal(out.library.anime[0].episodes.length,2);
  assert.equal(out.library.anime[0].episodes[0].links.length,2);assert.equal(out.library.anime[0].custom,'keep');
  assert.equal(out.body.sha,'original-sha');assert.equal(out.body.branch,'main');
  assert.equal(out.result.added,1);assert.equal(out.result.updated,1);assert.ok(!JSON.stringify(out.result).includes('TEST_TOKEN'));
});
test('Unchanged data does not create a commit',async()=>{
  const out=await run({library:{anime:[{title:'Test Anime',episodes:[episode(1)]}]},episodes:[episode(1)]});
  assert.equal(out.result.unchanged,true);assert.equal(out.body,null);
});
test('Cancelling preview never sends PUT',async()=>{
  const out=await run({episodes:[episode(1)],confirmValue:false});assert.equal(out.result.cancelled,true);assert.equal(out.body,null);
});
test('Rejects non-HTTP links before accessing GitHub',async()=>{
  await assert.rejects(run({episodes:[episode(1,'javascript:alert(1)')]}),/غير صالح/);
});
test('Reports conflict instead of overwriting concurrent changes',async()=>{
  await assert.rejects(run({episodes:[episode(1)],conflict:true}),/تغير الملف/);
});
test('Rejects use on anime sites before asking for a credential',async()=>{
  await assert.rejects(run({origin:'https://yalanime.com'}),/github.com/);
});
