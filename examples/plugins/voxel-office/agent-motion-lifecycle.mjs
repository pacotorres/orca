export function patchAgentMotionLifecycle(runtime) {
  const replaceOnce = (source, search, replacement, label) => {
    const first = source.indexOf(search)
    if (first === -1 || source.includes(search, first + search.length)) {
      throw new Error(`Expected one ${label} in the AgentVerse bundle`)
    }
    return source.slice(0, first) + replacement + source.slice(first + search.length)
  }

  runtime = replaceOnce(
    runtime,
    'function qq({agent:',
    'var voxelAgentAnimators=new Map,voxelCompletedSimulations=new Map;function getVoxelAgentAnimator(n){let e=voxelAgentAnimators.get(n);return e??(e=new gm("IDLE",{seed:n}),voxelAgentAnimators.set(n,e),e)}function getVoxelCompletedSimulation(n,e,t,i){let r=voxelCompletedSimulations.get(n.id),a=[n.name,n.statusUpdatedAt,e.id,t?.id??"",i.map(c=>c.id).join(",")].join("|");if(r?.key===a)return r.simulation;let s=Yq(n,e,t,i);return voxelCompletedSimulations.set(n.id,{key:a,simulation:s}),s}function pruneVoxelAgentAnimations(n){let e=new Set(n.map(t=>t.id));for(let t of voxelAgentAnimators.keys())e.has(t)||voxelAgentAnimators.delete(t);for(let t of voxelCompletedSimulations.keys())e.has(t)||voxelCompletedSimulations.delete(t)}function qq({agent:',
    'agent character component'
  )
  runtime = replaceOnce(
    runtime,
    'E=(0,Qt.useMemo)(()=>new gm("IDLE",{seed:n.id}),[n.id])',
    'E=(0,Qt.useMemo)(()=>getVoxelAgentAnimator(n.id),[n.id])',
    'agent animator'
  )
  runtime = replaceOnce(
    runtime,
    '()=>w?Yq(n,N,f,h):null,[n.id,n.name,w,N,f,h]',
    '()=>w?getVoxelCompletedSimulation(n,N,f,h):null,[n.id,n.name,w,N,f,h]',
    'completed-agent simulation'
  )
  runtime = replaceOnce(
    runtime,
    'E=(0,Qt.useMemo)(()=>kP(x),[x])',
    'E=(0,Qt.useMemo)(()=>kP(x),[x.map(R=>R.id).join("|")])',
    'coordinator partitions'
  )
  runtime = replaceOnce(
    runtime,
    'Xq(n,_.current);let v=',
    'Xq(n,_.current),pruneVoxelAgentAnimations(n.agents);let v=',
    'agent cache cleanup'
  )
  return runtime
}
