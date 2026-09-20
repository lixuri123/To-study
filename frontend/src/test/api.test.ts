import {expect,it,vi} from 'vitest';
import {api,authApi} from '../api';

it('serializes auth requests so an older cookie response finishes before a newer one starts',async()=>{
 let release!:()=>void;const first=new Promise<void>(resolve=>{release=resolve});const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);calls.push(url);if(url.endsWith('/me'))await first;return new Response(JSON.stringify({id:'u1',username:'林'}));}));
 const me=authApi('/auth/me');const login=authApi('/auth/login','POST',{username:'林',password:'password'});
 await Promise.resolve();expect(calls).toEqual(['/api/auth/me']);release();await Promise.all([me,login]);expect(calls).toEqual(['/api/auth/me','/api/auth/login']);
});

it('ignores a late unauthorized response that started before a successful login',async()=>{
 let release!:()=>void;const delayed=new Promise<void>(resolve=>{release=resolve});let revoked=0;
 window.addEventListener('qingjian:unauthorized',()=>revoked++,{once:true});
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);if(url.endsWith('/notes')){await delayed;return new Response('{"detail":"expired"}',{status:401})}return new Response(JSON.stringify({id:'u1',username:'林'}));}));
 const old=api('/notes').catch(()=>undefined);await authApi('/auth/login','POST',{username:'林',password:'password'});release();await old;expect(revoked).toBe(0);
});
