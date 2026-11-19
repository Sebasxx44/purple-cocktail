import {escape as h,icon} from './shared.mjs';

export function reelGallery(reels) {
  if (!reels.length) return '';
  const tones=['#674264','#80503a','#664277','#7d5539','#503c79'];
  const slides=reels.map((reel,i)=>{
    const id='reel-'+reel.id, next=reels[i+1];
    const sequence=String(i+1).padStart(2,'0')+' / '+String(reels.length).padStart(2,'0');
    return '<article id="'+h(id)+'" class="reel" aria-labelledby="'+h(id)+'-title" style="--reel-tone:'+tones[i%tones.length]+'">'+
      '<img class="reel-backdrop" src="'+h(reel.poster)+'" alt="" loading="lazy" decoding="async" fetchpriority="low">'+
      '<div class="wrap reel-layout"><div class="reel-copy"><p class="reel-byline">'+icon('instagram')+'<a href="https://www.instagram.com/purpleburguer_/" target="_blank" rel="noopener noreferrer">@purpleburguer_</a></p>'+
      '<h2 id="'+h(id)+'-title">'+h(reel.title)+'</h2>'+
      '<a class="reel-source" href="'+h(reel.url)+'" target="_blank" rel="noopener noreferrer">Ver en Instagram <span aria-hidden="true">↗</span></a></div>'+
      '<div class="reel-frame" data-video="'+h(reel.video)+'" data-title="'+h(reel.title)+'"><img class="reel-poster" src="'+h(reel.poster)+'" alt="" loading="lazy" decoding="async">'+
      '<button type="button" class="reel-play js-only" aria-label="Reproducir '+h(reel.title)+'">'+icon('play')+'</button></div>'+
      '<div class="reel-position"><span aria-label="Reel '+(i+1)+' de '+reels.length+'">'+sequence+'</span><a href="'+(next?'#reel-'+h(next.id):'#carta')+'">'+(next?'Siguiente reel '+icon('down'):'Volver a la carta '+icon('list'))+'</a></div>'+
      '<p class="reel-error" role="status"></p></div></article>';
  }).join('');
  return '<section id="reels" class="reels" aria-label="Reels de Purple en Instagram">'+slides+'</section>';
}

export function initReels() {
  const section=document.querySelector('#reels');
  if (!section) return;
  const progress=new WeakMap();
  let playback=null;

  function closePlayer(restoreFocus=false, ended=false) {
    if (!playback) return;
    const {video,slide,button}=playback;
    playback=null;
    progress.set(slide,ended?0:video.currentTime || progress.get(slide) || 0);
    video.pause(); video.removeAttribute('src'); video.load(); video.remove();
    slide.classList.remove('is-playing');
    if (restoreFocus) button.focus({preventScroll:true});
  }
  section.addEventListener('click',event=>{
    const button=event.target.closest('.reel-play');
    if (!button) return;
    closePlayer();
    const slide=button.closest('.reel'), frame=button.closest('.reel-frame');
    const status=slide.querySelector('.reel-error');
    const video=document.createElement('video');
    video.controls=true; video.playsInline=true; video.preload='none';
    video.poster=frame.querySelector('.reel-poster').currentSrc || frame.querySelector('.reel-poster').src;
    video.setAttribute('aria-label',frame.dataset.title);
    video.tabIndex=0;
    status.textContent='';
    playback={video,slide,button}; slide.classList.add('is-playing');
    frame.append(video);
    const failed=()=>{
      if (playback?.video!==video) return;
      closePlayer(true);
      status.textContent='No se pudo cargar el video. Puedes abrirlo con el enlace «Ver en Instagram».';
    };
    video.addEventListener('error',failed,{once:true});
    video.addEventListener('loadedmetadata',()=>{
      const saved=progress.get(slide);
      if (saved && saved<video.duration-.2) video.currentTime=saved;
    },{once:true});
    video.addEventListener('ended',()=>{if(playback?.video===video) closePlayer(true,true);},{once:true});
    video.src=frame.dataset.video;
    video.play().catch(failed);
    video.focus({preventScroll:true});
  });
  const visibility=new IntersectionObserver(entries=>{
    for(const entry of entries) {
      if (entry.target===playback?.slide && entry.intersectionRatio<.25) closePlayer();
    }
  },{threshold:[0,.25,.5]});
  section.querySelectorAll('.reel').forEach(slide=>visibility.observe(slide));
  document.addEventListener('visibilitychange',()=>{if(document.hidden) closePlayer();});
  window.addEventListener('pagehide',()=>closePlayer());
  const dialogs=new MutationObserver(()=>{if(document.querySelector('dialog[open]')) closePlayer();});
  document.querySelectorAll('dialog').forEach(dialog=>dialogs.observe(dialog,{attributes:true,attributeFilter:['open']}));
}
