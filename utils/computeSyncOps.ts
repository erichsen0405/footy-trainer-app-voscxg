
// BLOCK 1/3 - types & exports (paste block1, then block2, then block3)
export type FetchedEvent = {
  uid?: string | null;
  summary: string;
  dt: string; // ISO UTC
  status?: string | null;
  raw?: string | null;
};
export type ExternalEventRow = {
  id: string;
  uid?: string | null;
  provider_uids?: string[];
  summary: string;
  dt: string;
  last_seen?: string | null;
  miss_count?: number;
  deleted?: boolean;
  deleted_at?: string | null;
  status?: string | null;
};

export type SyncOptions = {
  graceHours?: number;
  fuzzyThreshold?: number;
  dtToleranceSeconds?: number;
  nowIso?: string;
};

export type CreateOp = { kind: "create"; event: FetchedEvent };
export type UpdateOp = { kind: "update"; id: string; changes: Partial<ExternalEventRow> };
export type SoftDeleteOp = { kind: "soft_delete"; id: string; deleted_at: string };
export type RestoreOp = { kind: "restore"; id: string };
export type SyncOps = { creates: CreateOp[]; updates: UpdateOp[]; softDeletes: SoftDeleteOp[]; restores: RestoreOp[] };

// BLOCK 2/3 - small helpers (paste second)
function nowIso(override?: string){ return override ?? new Date().toISOString(); }
function norm(s?: string | null){ return (s ?? "").trim().toLowerCase(); }
function tokenSet(s?: string | null){ return new Set((norm(s) ?? "").split(/\s+/).filter(Boolean)); }
function tokenOverlap(a?: string | null, b?: string | null){
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / Math.max(A.size, B.size);
}
function fuzzyRatio(a?: string | null, b?: string | null){ return tokenOverlap(a,b); }
function parseIso(dt?: string | null): Date | null { if(!dt) return null; const d = new Date(dt); return isNaN(d.getTime())?null:d; }
function sdKey(summary?: string | null, dt?: string | null){ return (summary && dt) ? `${norm(summary)}||${dt}` : null; }

// BLOCK 3/3 - computeSyncOps function
export function computeSyncOps(fetched: FetchedEvent[], dbRows: ExternalEventRow[], methodCancel=false, opts: SyncOptions={}): SyncOps {
  const g=opts.graceHours??2, ft=opts.fuzzyThreshold??0.65, dtTol=opts.dtToleranceSeconds??300, now=nowIso(opts.nowIso);
  const uidMap=new Map<string, ExternalEventRow>(), sdMap=new Map<string, ExternalEventRow>();
  for(const r of dbRows){
    if(r.uid) uidMap.set(r.uid,r);
    if(r.provider_uids) for(const pu of r.provider_uids) if(pu) uidMap.set(pu,r);
    const k=sdKey(r.summary,r.dt); if(k) sdMap.set(k,r);
  }
  const ops: SyncOps={creates:[],updates:[],softDeletes:[],restores:[]}, seen=new Set<string>();

  for(const fe of fetched){
    const uid=fe.uid??null, key=sdKey(fe.summary,fe.dt);

    const upd=(row: ExternalEventRow)=>{
      seen.add(row.id);
      const pu=Array.from(new Set([...(row.provider_uids||[]),...(uid?[uid]:[])]));
      ops.updates.push({kind:"update",id:row.id,changes:{
        last_seen:now,miss_count:0,status:fe.status??row.status,
        provider_uids:pu,uid:uid??row.uid,
        summary:row.summary!==fe.summary?fe.summary:row.summary,
        dt:row.dt!==fe.dt?fe.dt:row.dt
      }});
    };

    if(uid && uidMap.has(uid)){ upd(uidMap.get(uid)!); continue; }
    if(key && sdMap.has(key)){ upd(sdMap.get(key)!); continue; }

    let best: ExternalEventRow | null=null, bs=0;
    for(const r of dbRows){
      const base=Math.max(fuzzyRatio(fe.summary,r.summary),tokenOverlap(fe.summary,r.summary));
      let sc=base;
      if(r.dt&&fe.dt){
        const rd=parseIso(r.dt),fd=parseIso(fe.dt);
        if(rd&&fd && Math.abs((rd.getTime()-fd.getTime())/1000)<=dtTol) sc=Math.min(1,base+0.2);
      }
      if(sc>bs){ bs=sc; best=r; }
    }
    if(best && bs>=ft){ upd(best); continue; }

    ops.creates.push({kind:"create",event:fe});
  }

  const gm=g*3600*1000;
  for(const r of dbRows){
    if(seen.has(r.id)) continue;
    if(methodCancel && !r.deleted){
      ops.softDeletes.push({kind:"soft_delete",id:r.id,deleted_at:now});
      continue;
    }
    const ls=parseIso(r.last_seen??null);
    const ex=ls? (Date.now()-ls.getTime()) : null;
    if(ex && ex>gm){
      ops.softDeletes.push({kind:"soft_delete",id:r.id,deleted_at:now});
    } else {
      ops.updates.push({kind:"update",id:r.id,changes:{miss_count:(r.miss_count??0)+1,last_seen:now}});
    }
  }

  return ops;
}
