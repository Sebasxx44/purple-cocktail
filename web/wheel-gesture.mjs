// Classify a wheel impulse independently of paint and 3D rendering time.
// Browser timestamps include the original input time even when a frame is late.
export function wheelGesture({filterMomentum=false}={}) {
  let previousTime=-Infinity, started=0, direction=0, previous=0, peak=0;
  let total=0, sent=false, trough=Infinity, afterPause=Infinity;

  return {
    reset() { previousTime=-Infinity; },
    read(delta, mode, time) {
      const magnitude=Math.abs(delta), sign=Math.sign(delta), gap=time-previousTime;
      if (!sign) return 'hold';
      const detent=mode!==0 || (Number.isInteger(magnitude) && [100,120,150].includes(magnitude));
      const reverse=sign!==direction;
      if (gap>=145) afterPause=previous;
      // A delayed, still-decaying trackpad sample can arrive after the next
      // full-screen section is in place. Wait for a renewed rise or a notch.
      const coasting=filterMomentum && sent && !detent && !reverse &&
        gap>=90 && gap<380 && magnitude<previous*.86;
      if(coasting)afterPause=magnitude;
      const deliberateReverse=reverse && (gap>145 || magnitude>=Math.max(7,Math.min(25,peak*.38)));
      const newImpulse=!reverse && !coasting && (
        (detent && gap>=145) ||
        (gap>=230 && magnitude>=16) || (gap>=325 && magnitude>=5) ||
        (afterPause<Infinity && magnitude>=Math.max(6,afterPause*1.38)) ||
        (time-started>155 && trough<=3 && magnitude>=Math.max(11,Math.min(28,peak*.36)))
      );
      if (gap>520 || deliberateReverse || (sent && newImpulse)) {
        direction=sign; started=time; total=0; peak=0; trough=Infinity; afterPause=Infinity; sent=false;
      }
      previousTime=time;
      if (sign!==direction) return 'hold';
      previous=magnitude;
      if (sent && time-started>90) trough=Math.min(trough,magnitude);
      peak=Math.max(peak,magnitude);
      if (sent) return 'hold';
      total+=magnitude;
      if (total<5 && !detent) return 'pending';
      sent=true;
      return 'step';
    }
  };
}
