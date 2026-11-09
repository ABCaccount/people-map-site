import {deletionConfig} from './external-deletion-config.js';
import {normalizeDeletionCode} from './deletion-code-format.js';
export async function requestDeletion(config,input,confirmed,send=fetch){
  if(config.enabled!==true)return {state:'unavailable'};
  const url=new URL(config.endpoint);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/functions/v1/delete-account-data'||
    !(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Invalid configuration');
  if(url.protocol==='https:'&&(!/^[a-z]{20}$/.test(config.projectRef??'')||url.hostname!==config.projectRef+'.supabase.co'))throw Error('Project mismatch');
  const code=normalizeDeletionCode(input);
  if(!code||confirmed!==true)return {state:'invalid'};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const headers={'Content-Type':'application/json'};
    if(config.publicApiKey)headers.apikey=config.publicApiKey;
    const r=await send(url.href,{method:'POST',headers,body:JSON.stringify({action:'delete-external',code,confirm:true}),
      credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
    if(r.status===429)return {state:'pending',retryAfterSeconds:Math.min(300,Math.max(1,Number(r.headers.get('Retry-After'))||30))};
    if(r.status===400||r.status===401||r.status===404)return {state:'invalid'};
    const body=await r.json();
    return r.ok&&body.deleted===true?{state:'complete'}:{state:'pending',retryAfterSeconds:30};
  }catch{return {state:'pending',retryAfterSeconds:30};}
  finally{clearTimeout(timer);}
}
if(typeof document!=='undefined'){
 const form=document.querySelector('#deletion-form'),code=document.querySelector('#deletion-code');
 const button=document.querySelector('#request-delete'),status=document.querySelector('#request-status');
 let busy=false,waitUntil=0;
 const showStatus=(message,state)=>{status.textContent=message;status.dataset.state=state;status.hidden=false;};
 // The local UI is usable while the transport remains independently disabled.
 // requestDeletion() returns unavailable before any fetch when enabled=false.
 button.disabled=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||Date.now()<waitUntil)return;
  // Clicking Delete is the explicit submission; there is no second confirmation.
  busy=true;
  button.disabled=true;showStatus('Submitting request…','pending');
  const result=await requestDeletion(deletionConfig,code.value.trim(),true).catch(()=>({state:'unavailable'}));
  busy=false;
  if(result.state==='complete'){
   showStatus('Account deletion completed.','complete');code.value='';code.disabled=true;return;
  }
  if(result.state==='invalid')showStatus('Deletion was not completed. Check your account deletion code and try again.','error');
  else if(result.state==='unavailable')showStatus('Account deletion is not available yet. No request was sent.','error');
  else showStatus('Deletion is not confirmed. Wait before trying again.','error');
  const delay=(result.retryAfterSeconds??0)*1000;waitUntil=Date.now()+delay;
  if(delay>0)setTimeout(()=>{button.disabled=false;},delay);
  else button.disabled=false;
 });
}
