// Run only on github.com in Script Browser. Paste extract-episodes.js JSON.
if (location.origin !== 'https://github.com') throw new Error('افتح github.com أولاً؛ لا تدخل التوكن في موقع الأنمي.');
const endpoint = 'https://api.github.com/repos/malqammaz/anime-library/contents/library.json';
const branch = 'main';
const input = await new Promise(resolve => {
  const dialog = document.createElement('dialog');
  dialog.dir = 'rtl';
  dialog.style.cssText = 'width:min(560px,90vw);background:#172125;color:white;border:1px solid #59734e;border-radius:16px;padding:24px';
  dialog.innerHTML = `<form method="dialog"><h2>تحديث مكتبة الأنمي</h2><p>الصق ناتج سكربت استخراج الحلقات. ستظهر معاينة قبل الرفع.</p><label>اسم الأنمي<input name="title" required style="display:block;width:95%;margin:8px 0 18px;padding:10px"></label><label>JSON الحلقات<textarea name="json" required rows="9" style="display:block;width:95%;direction:ltr;margin:8px 0 18px;padding:10px"></textarea></label><label>GitHub token<input name="token" type="password" autocomplete="off" required style="display:block;width:95%;direction:ltr;margin:8px 0 18px;padding:10px"></label><p>استخدم Fine-grained token لريبو anime-library فقط، بصلاحية Contents: Read and write. لن يتم حفظه.</p><button type="submit">معاينة التعديل</button> <button type="button" id="cancel-update">إلغاء</button></form>`;
  const finish = value => { dialog.remove(); resolve(value); };
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();const form=event.currentTarget;
    const value={title:form.elements.title.value.trim(),json:form.elements.json.value,token:form.elements.token.value.trim()};
    form.elements.token.value='';finish(value);
  });
  dialog.querySelector('#cancel-update').onclick=()=>finish(null);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
  document.body.append(dialog);dialog.showModal();
});
if (!input) return {cancelled:true};
let token=input.token;input.token='';
try {
  const incoming=JSON.parse(input.json);
  if (!Array.isArray(incoming.episodes)) throw new Error('الصق ناتج سكربت استخراج الحلقات الذي يحتوي episodes.');
  if (!input.title) throw new Error('اسم الأنمي مطلوب.');
  const valid=incoming.episodes.filter(e=>e && !e.error && Array.isArray(e.links) && e.links.length);
  if (!valid.length) throw new Error('لا توجد حلقات ناجحة بروابط لإضافتها.');
  for(const episode of valid) for(const link of episode.links){
    if(!link || typeof link.url!=='string' || !/^https?:$/.test(new URL(link.url).protocol)) throw new Error('يوجد رابط غير صالح.');
  }
  const request=async(method,body)=>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(endpoint+(method==='GET'?`?ref=${branch}`:''),{method,redirect:'error',signal:controller.signal,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      if(!response.ok){
        if(response.status===409)throw new Error('تغير الملف أثناء التعديل. شغّل السكربت مرة أخرى لقراءة أحدث نسخة.');
        throw new Error(`GitHub HTTP ${response.status}؛ تحقق من التوكن وصلاحية Contents والفرع.`);
      }
      return await response.json();
    }finally{clearTimeout(timer);}
  };
  const file=await request('GET');
  if(file.encoding!=='base64' || !file.content || !file.sha)throw new Error('تعذر قراءة library.json؛ الملف فارغ أو كبير أو بصيغة غير متوقعة.');
  const bytes=Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
  const library=JSON.parse(new TextDecoder().decode(bytes));
  if(!Array.isArray(library.anime))throw new Error('صيغة المكتبة غير صحيحة؛ لم يتم تعديلها.');
  const before=JSON.stringify(library);
  let show=library.anime.find(a=>String(a.title).trim().toLowerCase()===input.title.toLowerCase());
  if(!show){show={title:input.title,episodes:[]};library.anime.push(show);}
  if(!Array.isArray(show.episodes))throw new Error('صيغة حلقات الأنمي المخزن غير صحيحة.');
  let added=0,updated=0;
  for(const episode of valid){
    if(episode.number===null || episode.number===undefined)throw new Error('رقم حلقة مفقود؛ لم يتم رفع أي تعديل.');
    let old=show.episodes.find(e=>String(e.number)===String(episode.number));
    if(!old){old={number:episode.number,title:episode.title || `الحلقة ${episode.number}`,links:[]};show.episodes.push(old);added++;}else updated++;
    if(!Array.isArray(old.links))throw new Error('صيغة الروابط المخزنة غير صحيحة.');
    // Preserve previous links and metadata; refresh matching URLs, add new URLs.
    for(const link of episode.links){const existing=old.links.find(l=>l.url===link.url);if(existing)Object.assign(existing,link);else old.links.push({...link});}
  }
  show.episodes.sort((a,b)=>Number(a.number)-Number(b.number));
  if(JSON.stringify(library)===before)return {unchanged:true,message:'المكتبة محدثة؛ لا يوجد تعديل لرفعه.'};
  const skipped=incoming.episodes.length-valid.length;
  if(!confirm(`رفع التعديل إلى malqammaz/anime-library/library.json؟\nالأنمي: ${input.title}\nحلقات جديدة: ${added}\nحلقات مدموجة: ${updated}\nحلقات متجاهلة لعدم وجود روابط: ${skipped}\nسيتم الاحتفاظ بالأنميات والحلقات والروابط السابقة.`))return {cancelled:true};
  const utf8=new TextEncoder().encode(JSON.stringify(library,null,2)+'\n');
  let binary='';for(let i=0;i<utf8.length;i+=8192)binary+=String.fromCharCode(...utf8.subarray(i,i+8192));
  const saved=await request('PUT',{message:`Update anime library: ${input.title}`,branch,sha:file.sha,content:btoa(binary)});
  return {success:true,added,updated,skipped,url:saved.content.html_url,commit:saved.commit.html_url};
} finally {token='';}
