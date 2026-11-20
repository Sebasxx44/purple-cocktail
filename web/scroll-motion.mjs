// A short, interruptible settle for scripted steps. Touch drags still scroll natively.
export function scrollMotion(read, write) {
  let frame=0;
  function cancel() {cancelAnimationFrame(frame);frame=0;}
  function to(end,duration,done) {
    cancel();
    const start=read(),distance=end-start,begin=performance.now();
    function finish(){write(end);frame=0;done?.();}
    if(!duration || Math.abs(distance)<2){finish();return;}
    function tick(now) {
      const t=Math.max(0,Math.min(1,(now-begin)/duration));
      if(t>=1){finish();return;}
      write(start+distance*(1-(1-t)**3));
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
  }
  return {to,cancel};
}
