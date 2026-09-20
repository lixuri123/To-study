import { useEffect, useState } from "react";
import { api } from "../api";

type Delivery = {id: string; affair_id: string; lease_token: string; title: string; body: string};

export function useDesktopNotifications(active: boolean) {
  const [status, setStatus] = useState("");
  useEffect(()=>{
    if(!active)return;
    let mounted=true;
    let pending=false;
    const tick=async()=>{
      const bridge=window.__QINGJIAN_DESKTOP__;
      if(!bridge?.notify||pending)return;
      pending=true;
      try{
        let device=localStorage.getItem("qingjian-notification-device");
        if(!device){device=crypto.randomUUID();localStorage.setItem("qingjian-notification-device",device);}
        const result=await api<{deliveries:Delivery[]}>("/reminders/claim","POST",{device_id:device});
        let failed=false;
        for(const delivery of result.deliveries){
          if(!mounted)break;
          let success=false;
          try{await bridge.notify(delivery);success=true;}catch{failed=true;}
          if(!mounted)break;
          await api(`/reminders/${delivery.id}/ack`,"POST",{device_id:device,lease_token:delivery.lease_token,success,error:success?"":"Windows 未确认接收通知"});
        }
        if(mounted)setStatus(failed?"部分系统通知发送失败，将自动重试。":"Windows 后台提醒已连接 · 关闭窗口后留在托盘 · 后端服务需保持运行");
      }catch(e){if(mounted)setStatus(`后台提醒连接异常，将自动重试：${e instanceof Error?e.message:"未知错误"}`);}
      finally{pending=false;}
    };
    window.addEventListener("qingjian:notification-tick",tick);
    window.addEventListener("qingjian:desktop-ready",tick);
    void tick();
    return()=>{mounted=false;window.removeEventListener("qingjian:notification-tick",tick);window.removeEventListener("qingjian:desktop-ready",tick);};
  },[active]);
  return status;
}

