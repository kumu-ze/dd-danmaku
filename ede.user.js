// ==UserScript==
// @name         Emby Danmaku Extension (dd-danmaku)
// @namespace    https://github.com/kumu-ze/dd-danmaku
// @description  Emby 弹幕插件：弹幕获取/过滤/外观/热度图/快捷设置
// @author       kumuze, RyoLee
// @version      2.0.1
// @license      MIT
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @grant        none
// @match        */web/index.html
// ==/UserScript==

(async function() {
  'use strict';
  // ------ configs start------
  const check_interval = 200; // 已被 MutationObserver 取代, 保留兼容
  const chConverTtitle = ['当前状态: 未启用', '当前状态: 转换为简体', '当前状态: 转换为繁体'];

  //图标常量
  // 0:当前状态关闭 1:当前状态打开
  const danmaku_icons = ['\uE7A2', '\uE0B9'];
  const search_icon = '\uE881';
  const translate_icon = '\uE927';
  const filter_icons = ['\uE3E0', '\uE3D0', '\uE3D1', '\uE3D2', '\uE3D2']; // 扩展支持0-4共5级
  // removed unused transparency_icons
  const info_switch_icons = ['\uE8F5', '\uE8F4'];
  const more_filter_icon = '\uE5D3';
  const log_icon = '\uE86D';
  const settings_icon = '\uE8B8';
  const reset_icon = '\uE166';
  const heatmap_icon = '\uE6DD'; // analytics-like icon
  const center_icon = '\uE871'; // dashboard icon for 弹幕中心，区别于设置

  //通用参数常量
  const menubarOptions = { class: 'flex flex-direction-row' };
  const buttonOptions = { class: 'paper-icon-button-light', is: 'paper-icon-button-light' };
  const rangeSliderOptions = { class: 'emby-slider emby-slider-scalebg emby-slider-nothumb', is: 'emby-slider' };
  const sliderContainerOptions = { class: 'slidercontainer flex-grow emby-slider-container' };
  const sliderWrapperOptions = { class: 'videoOsdVolumeSliderWrapper flex-grow' };
  const sliderdivOptions = { class: 'videoOsdVolumeControls flex flex-direction-row align-items-center', style: 'position:relative;' };
  // removed unused sliderLabelOptions

  //定位标志常量
  const uiAnchorStr = '\uE034';
  const mediaContainerQueryStr = 'div[class~="view-videoosd-videoosd"]';
  const mediaQueryStr = 'video';

  //全局透明度/移动端检测flag
  var globalOpacity = 1.0;
  // 初始化播放进度条不透明度变量（若存在用户自定义）
  (function(){ const o=localStorage.getItem('edeTimelineOpacity'); if(o){ const val=(o/100).toString(); document.documentElement.style.setProperty('--ede-pbp-unplayed-op', val); } })();
  var isMobile = false;
  const fontSizeDesktop = 25;
  const fontSizeMobile = 15;
  if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) isMobile = true;

  // StorageManager (阶段1)
  const StorageManager = {
    get(key, def = null) {
      try {
        const v = localStorage.getItem(key);
        if (v === null) return def;
        try { return JSON.parse(v); } catch { return v; }
      } catch { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch(e){ console.warn('Storage set fail', key, e); }
    },
    remove(key){ localStorage.removeItem(key); }
  };
  function debounce(fn, delay=300){ let t; function debounced(...args){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,args), delay);} debounced.cancel=()=>clearTimeout(t); return debounced; }
  // 统一当前秒级时间函数（便于后续精度/源切换）
  function nowSec(){ return performance.now()/1000; }
  // 缓存视频节点，避免频繁 querySelector
  let _cachedVideo=null;
  function getActiveVideo(){
    if(_cachedVideo && document.contains(_cachedVideo) && _cachedVideo.readyState) return _cachedVideo;
    const v=document.querySelector(mediaQueryStr);
    if(v && v.readyState){ _cachedVideo=v; }
    return (v && v.readyState)? v : (_cachedVideo && _cachedVideo.readyState? _cachedVideo : null);
  }
  function getActiveContainer(){ const list=document.querySelectorAll(mediaContainerQueryStr); for(const c of list){ if(!c.classList.contains('hide')) return c; } return null; }

  //各个控件差异化参数常量
  const displayButtonOpts = { title:'弹幕开关', id:'displayDanmaku', innerText:null, onclick: () => { if (window.ede.loading) { console.log('正在加载,请稍后再试'); return; } window.ede.danmakuSwitch = (window.ede.danmakuSwitch + 1) % 2; localStorage.setItem('danmakuSwitch', window.ede.danmakuSwitch); const btn=document.querySelector('#displayDanmaku'); if(btn) btn.children[0].innerText = danmaku_icons[window.ede.danmakuSwitch]; if (window.ede.danmaku) { window.ede.danmakuSwitch == 1 ? window.ede.danmaku.show() : window.ede.danmaku.hide(); } } };
  const searchButtonOpts = { title:'搜索弹幕', id:'searchDanmaku', innerText:search_icon, onclick: () => { if (window.ede.loading) { console.log('正在加载,请稍后再试'); return; } showSearchDialog(); } };
  const translateButtonOpts = { title:null, id:'translateDanmaku', innerText:translate_icon, onclick: () => { if (window.ede.loading) { console.log('正在加载,请稍后再试'); return; } window.ede.chConvert = (parseInt(window.ede.chConvert) + 1) % 3; StorageManager.set('chConvert', window.ede.chConvert); const el=document.querySelector('#translateDanmaku'); if(el) el.setAttribute('title', chConverTtitle[window.ede.chConvert]); reloadDanmaku('reload'); } };
  const filterButtonOpts = { title:'过滤等级(立即生效)', id:'filteringDanmaku', innerText:null, onclick: () => { let level = parseInt(StorageManager.get('danmakuFilterLevel', 0)) || 0; level = (level + 1) % 5; if(level===0){ const last=parseInt(localStorage.getItem('danmakuLastFilterLevel')||'0'); if(last===0) localStorage.setItem('danmakuLastFilterLevel','2'); } else { localStorage.setItem('danmakuLastFilterLevel', level); } StorageManager.set('danmakuFilterLevel', level); const btn=document.querySelector('#filteringDanmaku .md-icon'); if(btn) btn.innerText = filter_icons[level]; reloadDanmaku('reload'); } };
  // removed legacy transparencyRangeSliderOpts (quick panels now manage directly)
  const infoSwitchButtonOpts = { title:'弹幕信息显示', id:'switchDanmakuInfo', innerText:null, onclick:() => { window.ede.showDanmakuInfo = !window.ede.showDanmakuInfo; localStorage.setItem('showDanmakuInfo', window.ede.showDanmakuInfo); const btn=document.querySelector('#switchDanmakuInfo .md-icon'); if(btn) btn.innerText = info_switch_icons[window.ede.showDanmakuInfo?1:0]; const info=document.querySelector('#videoOsdDanmakuTitle'); if(info) info.style.display = window.ede.showDanmakuInfo?'block':'none'; } };
  const danmakuTypeFilterOpts = { bottom:{id:'bottom',name:'底部弹幕'}, top:{id:'top',name:'顶部弹幕'}, rolling:{id:'rolling',name:'滚动弹幕'}, onlyWhite:{id:'onlyWhite',name:'彩色弹幕'}, emoji:{id:'emoji',name:'emoji'} };
  const moreFilterButtonOpts = { title:'过滤(中心)', id:'moreFilteringDanmaku', innerText:more_filter_icon, onclick:()=>showDanmakuCenterDialog('filter') }; // 指向中心
  const logButtonOpts = { title:'显示调试日志', id:'showDanmakuLog', innerText:log_icon, onclick:()=>showLogDialog() };
  // 轻量外观设置快速面板 (前置定义，避免未定义错误)
  function showQuickAppearanceDialog(){
    if(document.getElementById('ede-quick-appearance')) return;
    const dialog=document.createElement('dialog'); dialog.id='ede-quick-appearance'; dialog.style='border:0;padding:0;background:transparent;';
    const font=localStorage.getItem('danmakuFontSize') || (isMobile?fontSizeMobile:fontSizeDesktop);
    const opacity=localStorage.getItem('danmakuTransparencyLevel')||'100';
    const speed=localStorage.getItem('danmakuSpeed')||'200';
    const timeline=(localStorage.getItem('danmakuTimelineEnabled')!=='false');
    dialog.innerHTML=`<div class='qa-shell ede-unified-shell' style="--qa-accent:#00a4dc;display:flex;flex-direction:column;min-width:440px;max-width:500px;background:linear-gradient(135deg,rgba(32,32,36,.94),rgba(18,18,20,.94));backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.08);border-radius:18px;overflow:hidden;color:#fff;font-size:14px;box-shadow:0 8px 28px -6px rgba(0,0,0,.45);animation:qa-fade .18s ease;">
      <style>dialog#ede-quick-appearance input[type=range]{-webkit-appearance:none;width:100%;height:6px;border-radius:4px;background:linear-gradient(to right,var(--qa-accent) 0%,var(--qa-accent) 50%,#444 50%,#444 100%);}dialog#ede-quick-appearance input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid var(--qa-accent);box-shadow:0 2px 4px rgba(0,0,0,.4);}#ede-quick-appearance .qa-row{display:flex;align-items:center;gap:12px;}#ede-quick-appearance .qa-label{width:56px;font-size:12px;opacity:.85;display:flex;align-items:center;gap:4px;}#ede-quick-appearance .qa-value{min-width:54px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:#00d2ff;background:rgba(255,255,255,.08);padding:4px 8px;border-radius:8px;}#ede-quick-appearance .qa-body{padding:18px 20px;display:flex;flex-direction:column;gap:18px;}#ede-quick-appearance .qa-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.07);}#ede-quick-appearance .qa-actions{display:flex;gap:6px;}#ede-quick-appearance .qa-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;cursor:pointer;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;transition:.2s;}#ede-quick-appearance .qa-btn:hover{background:rgba(255,255,255,.18);}#ede-quick-appearance .qa-btn:active{transform:scale(.9);}#ede-quick-appearance .qa-foot{display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-top:1px solid rgba(255,255,255,.07);font-size:11px;opacity:.65;}@keyframes qa-fade{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}</style>
      <div class='qa-head'>
        <strong style='font-size:15px;display:flex;align-items:center;gap:8px;'>外观快速设置<span style="padding:2px 6px;font-size:11px;background:#00a4dc22;color:#00c8ff;border-radius:4px;">实时</span></strong>
        <div class='qa-actions'>
          <button id='qaReset' class='qa-btn' title='重置为默认'><span class='md-icon'>${reset_icon}</span></button>
          <button id='qaClose' class='qa-btn' title='关闭'><span class='md-icon'>close</span></button>
        </div>
      </div>
      <div class='qa-body'>
        <div class='qa-row'>
          <span class='qa-label'>字体</span>
          <input type='range' id='qaFont' min='12' max='48' step='1' value='${font}'>
          <span class='qa-value'><span id='qaFontNum'>${font}</span>px</span>
        </div>
        <div class='qa-row'>
          <span class='qa-label'>不透明</span>
          <input type='range' id='qaOpacity' min='0' max='100' step='1' value='${opacity}'>
            <span class='qa-value'><span id='qaOpacityNum'>${opacity}</span>%</span>
        </div>
        <div class='qa-row'>
          <span class='qa-label'>速度</span>
          <input type='range' id='qaSpeed' min='60' max='300' step='5' value='${speed}'>
          <span class='qa-value'><span id='qaSpeedNum'>${speed}</span></span>
        </div>
        <label style='display:flex;align-items:center;gap:8px;font-size:12px;background:rgba(255,255,255,.06);padding:10px 12px;border-radius:12px;cursor:pointer;'>
          <input type='checkbox' id='qaTimeline' ${timeline?'checked':''} style='margin:0;'> 启用热度轨迹
        </label>
      </div>
      <div class='qa-foot'>值即时保存；速度越大滚动越快<div style='display:flex;gap:8px;'></div></div>
    </div>`;
    document.body.appendChild(dialog); dialog.showModal();
    // 独立的渐变填充函数避免依赖中心函数
    function paintRange(r){ if(!r) return; const min=r.min||0,max=r.max||100,val=r.value; const pct=((val-min)/(max-min))*100; r.style.background=`linear-gradient(to right, var(--qa-accent) 0%, var(--qa-accent) ${pct}%, #444 ${pct}%, #444 100%)`; }
    const bind=(id,key,cb)=>{ const el=dialog.querySelector('#'+id); const num=dialog.querySelector('#'+id+'Num'); paintRange(el); el.addEventListener('input',e=>{ const v=e.target.value; localStorage.setItem(key,v); if(num) num.textContent=v; if(cb) cb(v); paintRange(e.target); }); };
    bind('qaFont','danmakuFontSize',()=>reloadDanmaku('reload'));
    bind('qaOpacity','danmakuTransparencyLevel',v=>{ globalOpacity=v/100; });
    bind('qaSpeed','danmakuSpeed',v=>{ if(window.ede.danmaku) window.ede.danmaku.speed=parseInt(v); });
    const tl=dialog.querySelector('#qaTimeline'); tl.onchange=e=>{ localStorage.setItem('danmakuTimelineEnabled', e.target.checked); renderDanmakuTimeline(); };
    dialog.querySelector('#qaClose').onclick=()=>dialog.remove();
    dialog.querySelector('#qaReset').onclick=()=>{ const defF=isMobile?fontSizeMobile:fontSizeDesktop; ['qaFont','qaOpacity','qaSpeed'].forEach(id=>{ const el=dialog.querySelector('#'+id); if(id==='qaFont') el.value=defF; else if(id==='qaOpacity') el.value=100; else if(id==='qaSpeed') el.value=200; el.dispatchEvent(new Event('input')); }); tl.checked=true; tl.dispatchEvent(new Event('change')); };
  }
  window.showQuickAppearanceDialog = showQuickAppearanceDialog;
  const settingsButtonOpts = { title:'弹幕设置 (外观快捷)', id:'danmakuSettings', innerText:settings_icon, onclick:()=>showQuickAppearanceDialog() };
  const heatmapButtonOpts = { title:'实时热度图 (Alt+H)', id:'danmakuHeatmap', innerText:heatmap_icon, onclick:()=>showHeatmapDialog() };
  const centerButtonOpts = { title:'弹幕中心', id:'danmakuCenter', innerText:center_icon, onclick:()=>showDanmakuCenterDialog() };

  // ------ configs end------
  /* eslint-disable */
  /* https://cdn.jsdelivr.net/npm/danmaku/dist/danmaku.canvas.min.js */
  !function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):(t="undefined"!=typeof globalThis?globalThis:t||self).Danmaku=e()}(this,(function(){"use strict";var t=function(){for(var t=["oTransform","msTransform","mozTransform","webkitTransform","transform"],e=document.createElement("div").style,i=0;i<t.length;i++)if(t[i]in e)return t[i];return"transform"}();function e(t){var e=document.createElement("div");if(e.style.cssText="position:absolute;","function"==typeof t.render){var i=t.render();if(i instanceof HTMLElement)return e.appendChild(i),e}if(e.textContent=t.text,t.style)for(var n in t.style)e.style[n]=t.style[n];return e}var i={name:"dom",init:function(){var t=document.createElement("div");return t.style.cssText="overflow:hidden;white-space:nowrap;transform:translateZ(0);",t},clear:function(t){for(var e=t.lastChild;e;)t.removeChild(e),e=t.lastChild},resize:function(t,e,i){t.style.width=e+"px",t.style.height=i+"px"},framing:function(){},setup:function(t,i){var n=document.createDocumentFragment(),s=0,r=null;for(s=0;s<i.length;s++)(r=i[s]).node=r.node||e(r),n.appendChild(r.node);for(i.length&&t.appendChild(n),s=0;s<i.length;s++)(r=i[s]).width=r.width||r.node.offsetWidth,r.height=r.height||r.node.offsetHeight},render:function(e,i){i.node.style[t]="translate("+i.x+"px,"+i.y+"px)"},remove:function(t,e){t.removeChild(e.node),this.media||(e.node=null)}};const n=window.devicePixelRatio||1;var s=Object.create(null);function r(t,e){if("function"==typeof t.render){var i=t.render();if(i instanceof HTMLCanvasElement)return t.width=i.width,t.height=i.height,i}var r=document.createElement("canvas"),h=r.getContext("2d"),o=t.style||{};o.font=o.font||"10px sans-serif",o.textBaseline=o.textBaseline||"bottom";var a=1*o.lineWidth;for(var d in a=a>0&&a!==1/0?Math.ceil(a):1*!!o.strokeStyle,h.font=o.font,t.width=t.width||Math.max(1,Math.ceil(h.measureText(t.text).width)+2*a),t.height=t.height||Math.ceil(function(t,e){if(s[t])return s[t];var i=12,n=t.match(/(\d+(?:\.\d+)?)(px|%|em|rem)(?:\s*\/\s*(\d+(?:\.\d+)?)(px|%|em|rem)?)?/);if(n){var r=1*n[1]||10,h=n[2],o=1*n[3]||1.2,a=n[4];"%"===h&&(r*=e.container/100),"em"===h&&(r*=e.container),"rem"===h&&(r*=e.root),"px"===a&&(i=o),"%"===a&&(i=r*o/100),"em"===a&&(i=r*o),"rem"===a&&(i=e.root*o),void 0===a&&(i=r*o)}return s[t]=i,i}(o.font,e))+2*a,r.width=t.width*n,r.height=t.height*n,h.scale(n,n),o)h[d]=o[d];var u=0;switch(o.textBaseline){case"top":case"hanging":u=a;break;case"middle":u=t.height>>1;break;default:u=t.height-a}return o.strokeStyle&&h.strokeText(t.text,a,u),h.fillText(t.text,a,u),r}function h(t){return 1*window.getComputedStyle(t,null).getPropertyValue("font-size").match(/(.+)px/)[1]}var o={name:"canvas",init:function(t){var e=document.createElement("canvas");return e.context=e.getContext("2d"),e._fontSize={root:h(document.getElementsByTagName("html")[0]),container:h(t)},e},clear:function(t,e){t.context.clearRect(0,0,t.width,t.height);for(var i=0;i<e.length;i++)e[i].canvas=null},resize:function(t,e,i){t.width=e*n,t.height=i*n,t.style.width=e+"px",t.style.height=i+"px"},framing:function(t){t.context.clearRect(0,0,t.width,t.height)},setup:function(t,e){for(var i=0;i<e.length;i++){var n=e[i];n.canvas=r(n,t._fontSize)}},render:function(t,e){t.context.globalAlpha=globalOpacity,t.context.drawImage(e.canvas,e.x*n,e.y*n)},remove:function(t,e){e.canvas=null}};function a(t){var e=this,i=this.media?this.media.currentTime:Date.now()/1e3,n=this.media?this.media.playbackRate:1;function s(t,s){if("top"===s.mode||"bottom"===s.mode)return i-t.time<e._.duration;var r=(e._.width+t.width)*(i-t.time)*n/e._.duration;if(t.width>r)return!0;var h=e._.duration+t.time-i,o=e._.width+s.width,a=e.media?s.time:s._utc,d=o*(i-a)*n/e._.duration,u=e._.width-d;return h>e._.duration*u/(e._.width+s.width)}for(var r=this._.space[t.mode],h=0,o=0,a=1;a<r.length;a++){var d=r[a],u=t.height;if("top"!==t.mode&&"bottom"!==t.mode||(u+=d.height),d.range-d.height-r[h].range>=u){o=a;break}s(d,t)&&(h=a)}var m=r[h].range,c={range:m+t.height,time:this.media?t.time:t._utc,width:t.width,height:t.height};return r.splice(h+1,o-h-1,c),"bottom"===t.mode?this._.height-t.height-m%this._.height:m%(this._.height-t.height)}var d=window.requestAnimationFrame||window.mozRequestAnimationFrame||window.webkitRequestAnimationFrame||function(t){return setTimeout(t,50/3)},u=window.cancelAnimationFrame||window.mozCancelAnimationFrame||window.webkitCancelAnimationFrame||clearTimeout;function m(t,e,i){for(var n=0,s=0,r=t.length;s<r-1;)i>=t[n=s+r>>1][e]?s=n:r=n;return t[s]&&i<t[s][e]?s:r}function c(t){return/^(ltr|top|bottom)$/i.test(t)?t.toLowerCase():"rtl"}function l(){var t=9007199254740991;return[{range:0,time:-t,width:t,height:0},{range:t,time:t,width:0,height:0}]}function f(t){t.ltr=l(),t.rtl=l(),t.top=l(),t.bottom=l()}function p(){if(!this._.visible||!this._.paused)return this;if(this._.paused=!1,this.media)for(var t=0;t<this._.runningList.length;t++){var e=this._.runningList[t];e._utc=Date.now()/1e3-(this.media.currentTime-e.time)}var i=this,n=function(t,e,i,n){return function(){t(this._.stage);var s=Date.now()/1e3,r=this.media?this.media.currentTime:s,h=this.media?this.media.playbackRate:1,o=null,d=0,u=0;for(u=this._.runningList.length-1;u>=0;u--)o=this._.runningList[u],r-(d=this.media?o.time:o._utc)>this._.duration&&(n(this._.stage,o),this._.runningList.splice(u,1));for(var m=[];this._.position<this.comments.length&&(o=this.comments[this._.position],!((d=this.media?o.time:o._utc)>=r));)r-d>this._.duration||(this.media&&(o._utc=s-(this.media.currentTime-o.time)),m.push(o)),++this._.position;for(e(this._.stage,m),u=0;u<m.length;u++)(o=m[u]).y=a.call(this,o),this._.runningList.push(o);for(u=0;u<this._.runningList.length;u++){o=this._.runningList[u];var c=(this._.width+o.width)*(s-o._utc)*h/this._.duration;"ltr"===o.mode&&(o.x=c-o.width+.5|0),"rtl"===o.mode&&(o.x=this._.width-c+.5|0),"top"!==o.mode&&"bottom"!==o.mode||(o.x=this._.width-o.width>>1),i(this._.stage,o)}}}(this._.engine.framing.bind(this),this._.engine.setup.bind(this),this._.engine.render.bind(this),this._.engine.remove.bind(this));return this._.requestID=d((function t(){n.call(i),i._.requestID=d(t)})),this}function g(){return!this._.visible||this._.paused||(this._.paused=!0,u(this._.requestID),this._.requestID=0),this}function _(){if(!this.media)return this;this.clear(),f(this._.space);var t=m(this.comments,"time",this.media.currentTime);return this._.position=Math.max(0,t-1),this}function v(t){t.play=p.bind(this),t.pause=g.bind(this),t.seeking=_.bind(this),this.media.addEventListener("play",t.play),this.media.addEventListener("pause",t.pause),this.media.addEventListener("playing",t.play),this.media.addEventListener("waiting",t.pause),this.media.addEventListener("seeking",t.seeking)}function w(t){this.media.removeEventListener("play",t.play),this.media.removeEventListener("pause",t.pause),this.media.removeEventListener("playing",t.play),this.media.removeEventListener("waiting",t.pause),this.media.removeEventListener("seeking",t.seeking),t.play=null,t.pause=null,t.seeking=null}function y(t){this._={},this.container=t.container||document.createElement("div"),this.media=t.media,this._.visible=!0,this.engine=(t.engine||"DOM").toLowerCase(),this._.engine="canvas"===this.engine?o:i,this._.requestID=0,this._.speed=Math.max(0,t.speed)||144,this._.duration=4,this.comments=t.comments||[],this.comments.sort((function(t,e){return t.time-e.time}));for(var e=0;e<this.comments.length;e++)this.comments[e].mode=c(this.comments[e].mode);return this._.runningList=[],this._.position=0,this._.paused=!0,this.media&&(this._.listener={},v.call(this,this._.listener)),this._.stage=this._.engine.init(this.container),this._.stage.style.cssText+="position:relative;pointer-events:none;",this.resize(),this.container.appendChild(this._.stage),this._.space={},f(this._.space),this.media&&this.media.paused||(_.call(this),p.call(this)),this}function x(){if(!this.container)return this;for(var t in g.call(this),this.clear(),this.container.removeChild(this._.stage),this.media&&w.call(this,this._.listener),this)Object.prototype.hasOwnProperty.call(this,t)&&(this[t]=null);return this}var b=["mode","time","text","render","style"];function L(t){if(!t||"[object Object]"!==Object.prototype.toString.call(t))return this;for(var e={},i=0;i<b.length;i++)void 0!==t[b[i]]&&(e[b[i]]=t[b[i]]);if(e.text=(e.text||"").toString(),e.mode=c(e.mode),e._utc=Date.now()/1e3,this.media){var n=0;void 0===e.time?(e.time=this.media.currentTime,n=this._.position):(n=m(this.comments,"time",e.time))<this._.position&&(this._.position+=1),this.comments.splice(n,0,e)}else this.comments.push(e);return this}function T(){return this._.visible?this:(this._.visible=!0,this.media&&this.media.paused||(_.call(this),p.call(this)),this)}function E(){return this._.visible?(g.call(this),this.clear(),this._.visible=!1,this):this}function k(){return this._.engine.clear(this._.stage,this._.runningList),this._.runningList=[],this}function C(){return this._.width=this.container.offsetWidth,this._.height=this.container.offsetHeight,this._.engine.resize(this._.stage,this._.width,this._.height),this._.duration=this._.width/this._.speed,this}var D={get:function(){return this._.speed},set:function(t){return"number"!=typeof t||isNaN(t)||!isFinite(t)||t<=0?this._.speed:(this._.speed=t,this._.width&&(this._.duration=this._.width/t),t)}};function z(t){t&&y.call(this,t)}return z.prototype.destroy=function(){return x.call(this)},z.prototype.emit=function(t){return L.call(this,t)},z.prototype.show=function(){return T.call(this)},z.prototype.hide=function(){return E.call(this)},z.prototype.clear=function(){return k.call(this)},z.prototype.resize=function(){return C.call(this)},Object.defineProperty(z.prototype,"speed",D),z}));
  /* eslint-enable */

  class EDE {
    constructor() {
      this.chConvert = localStorage.getItem('chConvert') || 1;
  this.danmakuSwitch = localStorage.getItem('danmakuSwitch') ? parseInt(localStorage.getItem('danmakuSwitch')) : 0;
      this.danmaku = null;
      this.episode_info = null;
      this.ob = null;
      this.loading = false;
      this.showDanmakuInfo = localStorage.getItem('showDanmakuInfo') === null ? true : localStorage.getItem('showDanmakuInfo') === 'true';
      this.originalCount = 0;
      this.lastError = null;
      this.corsStatus = '未测试';
      this.autoMatchStatus = '未开始';
      this.lastApiResponse = null;
      this.filterWords = localStorage.getItem('danmakuFilterWords') ? JSON.parse(localStorage.getItem('danmakuFilterWords')) : [];
      this.cacheEnabled = localStorage.getItem('danmakuCacheEnabled') !== 'false';
  this.buttonOrder = localStorage.getItem('danmakuButtonOrder') ? JSON.parse(localStorage.getItem('danmakuButtonOrder')) : ['displayDanmaku','filteringDanmaku','danmakuSettings','switchDanmakuInfo','searchDanmaku','showDanmakuLog'];
  // 迁移: 移除已废弃 filterSettings
  this.buttonOrder = this.buttonOrder.filter(x=>x!=='filterSettings');
  // 自动把新按钮加入顺序（若不存在）
  if(!this.buttonOrder.includes('danmakuHeatmap')){ this.buttonOrder.push('danmakuHeatmap'); localStorage.setItem('danmakuButtonOrder', JSON.stringify(this.buttonOrder)); }
  this.compactUI = localStorage.getItem('danmakuCompactUI') === 'true';
  // 外显按钮（除 display / center 外，其余通过中心二级菜单访问）
  try { this.externalButtons = JSON.parse(localStorage.getItem('danmakuExternalButtons')||'["filteringDanmaku","danmakuSettings","searchDanmaku"]'); } catch{ this.externalButtons=["filteringDanmaku","danmakuSettings","searchDanmaku"]; }
  this.externalButtons = this.externalButtons.filter(x=>x!=='filterSettings');
      this.currentProxyIndex = 0;
      this.customProxyServer = localStorage.getItem('danmakuCustomProxy') || '';
      const savedProxyIndex = localStorage.getItem('danmakuProxyIndex');
      if (savedProxyIndex !== null) this.currentProxyIndex = parseInt(savedProxyIndex);
    }
  }

  // removed unused createRangeSlider (UI 已重构不再调用)

  function createButton(opt) { const button = document.createElement('button', buttonOptions); button.setAttribute('title', opt.title); button.setAttribute('id', opt.id); const icon = document.createElement('span'); icon.className = 'md-icon'; icon.innerText = opt.innerText; button.appendChild(icon); button.onclick = opt.onclick; return button; }
  // 统一对话框样式工具
  function ensureUnifiedDialogStyles(){ if(document.getElementById('ede-dialog-style')) return; const st=document.createElement('style'); st.id='ede-dialog-style'; st.textContent=`dialog.ede-unified{border:0;background:transparent;padding:0;} .ede-shell{display:flex;flex-direction:column;max-height:78vh;min-width:420px;background:rgba(30,30,32,.95);backdrop-filter:blur(18px);border-radius:18px;overflow:hidden;color:#fff;font-size:14px;} .ede-head{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.07);} .ede-head h3{margin:0;font-size:16px;font-weight:600;display:flex;align-items:center;gap:.5em;} .ede-body{padding:16px 18px;overflow:auto;flex:1;} .ede-icon-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.18s;} .ede-icon-btn:hover{background:rgba(255,255,255,.18);} .ede-badge{padding:2px 6px;font-size:11px;background:#00a4dc22;color:#00c8ff;border-radius:4px;} .ede-toolbar-mini{display:flex;gap:6px;}`; document.head.appendChild(st);} 
  function unifyDialog(dialog,title){ try{ ensureUnifiedDialogStyles(); if(dialog.classList.contains('ede-unified')) return; const shell=document.createElement('div'); shell.className='ede-shell'; const head=document.createElement('div'); head.className='ede-head'; head.innerHTML=`<h3>${title}</h3><div class='ede-toolbar-mini'><button class='ede-icon-btn' data-act='close' title='关闭'><span class='md-icon'>close</span></button></div>`; const body=document.createElement('div'); body.className='ede-body'; while(dialog.firstChild) body.appendChild(dialog.firstChild); shell.appendChild(head); shell.appendChild(body); dialog.appendChild(shell); dialog.classList.add('ede-unified'); head.querySelector('[data-act="close"]').onclick=()=>dialog.remove(); } catch(e){ console.warn('unify fail',e); } }

  function ensureToolbarStyles(){
    if(document.getElementById('ede-toolbar-style')) return;
    const st=document.createElement('style'); st.id='ede-toolbar-style';
    st.textContent=`#danmakuCtr{gap:4px;display:flex;align-items:center;}#danmakuCtr button.paper-icon-button-light{position:relative;border-radius:8px!important;width:38px;height:38px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);backdrop-filter:blur(6px);transition:.2s;border:1px solid rgba(255,255,255,.12);}#danmakuCtr button.paper-icon-button-light:hover{background:rgba(255,255,255,.18);}#danmakuCtr button.paper-icon-button-light:active{transform:scale(.9);}#danmakuCtr .md-icon{font-size:20px;}dialog#danmakuCenterDialog input[type=range]{-webkit-appearance:none;height:6px;border-radius:4px;background:linear-gradient(to right,#00a4dc 0%,#00a4dc 50%,#444 50%,#444 100%);outline:none;}dialog#danmakuCenterDialog input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #00a4dc;box-shadow:0 2px 4px rgba(0,0,0,.4);}dialog#danmakuCenterDialog .range-line{display:flex;align-items:center;gap:8px;margin:6px 0;}dialog#danmakuCenterDialog .range-line .lbl{width:48px;opacity:.85;}dialog#danmakuCenterDialog .range-line .num{min-width:34px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:#00c8ff;}dialog#danmakuCenterDialog .toggle-line{display:flex;gap:18px;margin-top:4px;font-size:12px;}dialog#danmakuCenterDialog .note{margin-top:4px;}`;
    document.head.appendChild(st);
  }

  function initListener() {
    const container = getActiveVideo();
    if (!container) { if (window.ede.episode_info) window.ede.episode_info = null; return; }
    if (!container.getAttribute('ede_listening')) {
      console.log('正在初始化Listener');
      container.setAttribute('ede_listening', '1');
      container.addEventListener('play', () => reloadDanmaku('check', true));
      reloadDanmaku('init', true);
      console.log('Listener初始化完成');
    }
  }

  function getElementsByInnerText(tagType, innerStr, excludeChildNode = true) {
    var temp = []; var elements = document.getElementsByTagName(tagType); if (!elements || elements.length === 0) return temp;
    for (let i=0;i<elements.length;i++){ const e=elements[i]; if (e.innerText.includes(innerStr)) temp.push(e); }
    if (!excludeChildNode) return temp;
    var res=[]; temp.forEach(e=>{ var c=e.cloneNode(true); while(c.firstChild!=c.lastChild) c.removeChild(c.lastChild); if(c.innerText.includes(innerStr)) res.push(e); });
    return res;
  }

  function initUI() {
    let uiAnchor = getElementsByInnerText('i', uiAnchorStr); if (!uiAnchor || !uiAnchor[0]) return;
    let NotHideFlag = 0; let TargetIndex = null;
    for (let index=0; index<uiAnchor.length; index++) {
      if (uiAnchor[index].parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.classList.contains('hide')) continue; else { NotHideFlag=1; TargetIndex=index; }
    }
    if (!NotHideFlag) return;
  if (document.getElementById('danmakuCtr') && !document.getElementById('danmakuCtr').parentNode.parentNode.parentNode.parentNode.parentNode.classList.contains('hide')) return;
  if (document.getElementById('danmakuCtr')) document.getElementById('danmakuCtr').remove();
  ensureToolbarStyles();
    let parent = uiAnchor[TargetIndex].parentNode.parentNode.parentNode; let menubar=document.createElement('div'); menubar.id='danmakuCtr'; menubar.className=menubarOptions.class; if(!window.ede.episode_info) menubar.style.opacity=0.5; parent.append(menubar);
  const buttonConfigs = { displayDanmaku:{...displayButtonOpts,label:'弹幕开关'}, filteringDanmaku:{...filterButtonOpts,label:'过滤等级'}, danmakuSettings:{...settingsButtonOpts,label:'弹幕设置'}, switchDanmakuInfo:{...infoSwitchButtonOpts,label:'信息显示'}, searchDanmaku:{...searchButtonOpts,label:'搜索弹幕'}, showDanmakuLog:{...logButtonOpts,label:'调试日志'}, danmakuHeatmap:{...heatmapButtonOpts,label:'热度图'}, danmakuCenter:{...centerButtonOpts,label:'弹幕中心'} };
  const addBtn=(id)=>{ const cfg=buttonConfigs[id]; if(!cfg) return; if(id==='displayDanmaku') cfg.innerText = danmaku_icons[window.ede.danmakuSwitch]; else if(id==='switchDanmakuInfo') cfg.innerText = info_switch_icons[window.ede.showDanmakuInfo?1:0]; else if(id==='filteringDanmaku'){ const lv=parseInt(localStorage.getItem('danmakuFilterLevel')||0); cfg.innerText = filter_icons[lv]; } menubar.appendChild(createButton(cfg)); };
  if(window.ede.compactUI){ addBtn('displayDanmaku'); addBtn('danmakuCenter'); }
  else {
    // 外显顺序: 以 buttonOrder 为基准筛选 externalButtons
    const externalSet=new Set(window.ede.externalButtons||[]);
    window.ede.buttonOrder.forEach(id=>{ if(id==='displayDanmaku' || id==='danmakuCenter') return; if(externalSet.has(id)) addBtn(id); });
    // 头部添加必需开关
    menubar.insertBefore(createButton({ ...buttonConfigs['displayDanmaku'], innerText: danmaku_icons[window.ede.danmakuSwitch] }), menubar.firstChild);
    // 末尾添加中心入口
    addBtn('danmakuCenter');
  }
  }

  function sendNotification(title, msg) { const Notification = window.Notification || window.webkitNotifications; console.log(msg); if (Notification && Notification.permission === 'granted') { return new Notification(title,{body:msg}); } else if(Notification){ Notification.requestPermission(p=>{ if(p==='granted') new Notification(title,{body:msg}); }); } }

  function getEmbyItemInfo() { return window.require(['pluginManager']).then((items)=>{ if(items){ for(let i=0;i<items.length;i++){ const item=items[i]; if(item.pluginsList){ for(let j=0;j<item.pluginsList.length;j++){ const plugin=item.pluginsList[j]; if(plugin && plugin.id=='htmlvideoplayer') return plugin._currentPlayOptions?plugin._currentPlayOptions.item:null; } } } } return null; }); }

  async function getEpisodeInfo(is_auto = true) { try { window.ede.autoMatchStatus='开始获取视频信息'; let item=await getEmbyItemInfo(); if(!item){ window.ede.autoMatchStatus='获取视频信息失败'; window.ede.lastError='EmbyItemInfo is null'; return null; } let _id=item.Type=='Episode'?item.SeasonId:item.Id; let animeName=item.Type=='Episode'? item.SeriesName : item.Name; let episode=item.Type=='Episode'? item.IndexNumber : 'movie'; let originalTitle=item.OriginalTitle || (item.Type==='Episode'? item.SeriesOriginalTitle : null); if(item.Type=='Episode' && item.ParentIndexNumber!=1) animeName += ' ' + item.ParentIndexNumber; window.ede._searchName=animeName; window.ede._originalTitle=originalTitle; window.ede._currentEpisode= episode==='movie'?0:episode-1; const _episode_key = '_episode_id_rel_' + _id + '_' + episode; if(is_auto && localStorage.getItem(_episode_key)) return JSON.parse(localStorage.getItem(_episode_key)); if(!is_auto){ await showSearchDialog(); return null; } const now=Date.now(); const searchKey=`_search_lock_${_id}`; const lastSearch=localStorage.getItem(searchKey); if(lastSearch){ const data=JSON.parse(lastSearch); if(now-data.timestamp < 60000){ console.log('搜索冷却中，跳过自动匹配'); return null; } } localStorage.setItem(searchKey, JSON.stringify({timestamp:now})); let searchResult = await trySearch(animeName); if(!searchResult && originalTitle && originalTitle!==animeName){ window.ede.autoMatchStatus='使用原始标题重试搜索'; searchResult = await trySearch(originalTitle); } if(!searchResult){ window.ede.autoMatchStatus='自动匹配失败'; return null; } return processSearchResult(searchResult, _id, _episode_key, episode); } catch(err){ window.ede.autoMatchStatus='自动匹配失败'; window.ede.lastError=err.stack; console.error(err); return null; } }

  function processSearchResult(animaInfo, _id, _episode_key, episode){ if(!animaInfo || !animaInfo.animes || animaInfo.animes.length===0) return null; const selectedAnime=animaInfo.animes[0]; let selectedEpisode; if(episode==='movie') selectedEpisode=selectedAnime.episodes[0]; else selectedEpisode = selectedAnime.episodes.find(ep=>{ const epNum=parseInt(ep.episodeTitle.match(/\d+/)?.[0]||'0'); return epNum===episode; }) || selectedAnime.episodes[episode-1]; if(!selectedEpisode) return null; const episodeInfo={ episodeId:selectedEpisode.episodeId, animeTitle:selectedAnime.animeTitle, episodeTitle: selectedAnime.type==='tvseries'? selectedEpisode.episodeTitle : null }; localStorage.setItem('_anime_id_rel_' + _id, selectedAnime.animeId); localStorage.setItem(_episode_key, JSON.stringify(episodeInfo)); window.ede.autoMatchStatus='自动匹配成功'; return episodeInfo; }

  const defaultProxyServers=['https://www.kumuze-dd.icu/'];
  async function trySearch(name){ if(!window.ede.cacheEnabled) return searchAnimeDirectly(name); const cacheKey=`_search_cache_${encodeURIComponent(name)}`; const cached=localStorage.getItem(cacheKey); if(cached){ const o=JSON.parse(cached); if(o.timestamp > Date.now()-86400000){ window.ede.autoMatchStatus='使用缓存结果'; return o.data; } } return searchAnimeDirectly(name); }

  async function searchAnimeDirectly(name){ try { const proxyServer=window.ede.customProxyServer || defaultProxyServers[window.ede.currentProxyIndex]; const url=`${proxyServer}api/v2/search/episodes?anime=${encodeURIComponent(name)}`; const resp=await fetch(url); if(!resp.ok) throw new Error('HTTP '+resp.status); const data=await resp.json(); if(!data || !data.animes || data.animes.length===0) return null; if(window.ede.cacheEnabled){ localStorage.setItem(`_search_cache_${encodeURIComponent(name)}` , JSON.stringify({timestamp:Date.now(),data})); } return data; } catch(e){ if(!window.ede.customProxyServer && window.ede.currentProxyIndex < defaultProxyServers.length-1){ window.ede.currentProxyIndex++; localStorage.setItem('danmakuProxyIndex', window.ede.currentProxyIndex); showTooltip(`切换备用代理 ${window.ede.currentProxyIndex+1}`); return searchAnimeDirectly(name); } console.error('搜索失败', e); return null; } }

  async function getComments(episodeId){ if(!window.ede.cacheEnabled) return getCommentsDirectly(episodeId); const cacheKey=`_danmaku_cache_${episodeId}`; const cached=localStorage.getItem(cacheKey); if(cached){ try { const o=JSON.parse(cached); if(o.timestamp > Date.now()-3600000){ if(o.compressed){ const json=LZString.decompressFromBase64(o.data); return JSON.parse(json); } return o.comments; } } catch{} } return getCommentsDirectly(episodeId); }

  async function getCommentsDirectly(episodeId){ try { const proxyServer=window.ede.customProxyServer || defaultProxyServers[window.ede.currentProxyIndex]; const url=`${proxyServer}api/v2/comment/${episodeId}?withRelated=true&chConvert=${window.ede.chConvert}`; const resp=await fetch(url); const text=await resp.text(); try { const data=JSON.parse(text); if(data.errorCode||data.hasError) throw new Error(data.errorMessage||data.message||'API错误'); if(!data.comments || !Array.isArray(data.comments)) throw new Error('返回数据格式错误'); if(window.ede.cacheEnabled){ try { const compressed=LZString.compressToBase64(JSON.stringify(data.comments)); localStorage.setItem(`_danmaku_cache_${episodeId}`, JSON.stringify({timestamp:Date.now(), compressed:true, data:compressed})); } catch(e){ localStorage.setItem(`_danmaku_cache_${episodeId}`, JSON.stringify({timestamp:Date.now(), comments:data.comments})); } } console.log('弹幕下载成功: '+data.comments.length); return data.comments; } catch(pe){ window.ede.lastApiResponse=text; throw new Error('解析响应失败: '+pe.message); } } catch(e){ if(!window.ede.customProxyServer && window.ede.currentProxyIndex < defaultProxyServers.length-1){ window.ede.currentProxyIndex++; localStorage.setItem('danmakuProxyIndex', window.ede.currentProxyIndex); showTooltip(`切换备用代理 ${window.ede.currentProxyIndex+1}`); return getCommentsDirectly(episodeId); } window.ede.lastError=e.stack; console.error('获取弹幕失败', e); sendNotification('获取弹幕失败', e.message); return null; } }

  async function createDanmaku(comments){ if(!comments) return; window.ede.originalCount=comments.length; const videoElement=getActiveVideo(); if(!videoElement) return; if(window.ede.danmaku){ window.ede.danmaku.clear(); window.ede.danmaku.destroy(); window.ede.danmaku=null; } // 解析并保存
    // 确保过滤资源已编译
    if(!window.ede._filterResourcesReady) compileFilterResources();
  // 新视频/新弹幕源时重置已观看段状态，避免沿用上一视频的蓝色覆盖
  window.ede._watchedSegments=[]; window.ede._lastSegmentUpdateTime=0; // 其余相关变量由逻辑按需再建
  window.ede.parsedComments = danmakuParser(comments); const filtered = applyAllFilters(window.ede.parsedComments); const container=getActiveContainer(); if(!container) return; globalOpacity = parseInt(localStorage.getItem('danmakuTransparencyLevel')||100)/100; const savedSpeed = parseInt(localStorage.getItem('danmakuSpeed')) || 200; window.ede.danmaku = new Danmaku({ container, media:videoElement, comments:filtered, engine:'canvas', speed: savedSpeed }); window.ede.filteredComments = filtered;
    // 构建秒级索引供动态密度监控使用
    (function buildSecondIndex(){ try { if(!filtered.length){ window.ede._countsBySecond=null; return; } const dur = Math.max(videoElement.duration||0, filtered[filtered.length-1].time|0)+2; const arr=new Array(Math.ceil(dur)+1).fill(0); for(const c of filtered){ const si = c.time|0; if(si>=0 && si<arr.length) arr[si]++; } window.ede._countsBySecond = arr; } catch(e){ window.ede._countsBySecond=null; } })();
    appendvideoOsdDanmakuInfo(filtered.length); window.ede.danmakuSwitch==1? window.ede.danmaku.show() : window.ede.danmaku.hide(); if(window.ede.ob) window.ede.ob.disconnect(); window.ede.ob = new ResizeObserver(()=>{ if(window.ede.danmaku){ window.ede.danmaku.resize(); renderDanmakuTimeline(true); } }); window.ede.ob.observe(container); startDynamicDensityMonitor(); buildDanmakuDensityData(); renderDanmakuTimeline(); attachTimelineMediaEvents(); }

  // 新核心重载 + 防抖 (阶段1)
  function coreReloadDanmaku(type='check'){
    if(window.ede.loading){ console.log('正在重新加载'); return; }
    window.ede.loading=true;
    const videoElement=getActiveVideo();
    if(!videoElement){ window.ede.loading=false; setTimeout(()=>reloadDanmaku(type,true),500); return; }
    if(type==='reload'){
      const currentEpisodeId=window.ede?.episode_info?.episodeId;
      Object.keys(localStorage).forEach(k=>{ if(k.startsWith('_danmaku_cache_')){ if(!currentEpisodeId || k===`_danmaku_cache_${currentEpisodeId}`){ localStorage.removeItem(k);} } });
    }
    getEpisodeInfo(type!=='search')
      .then(info=> new Promise((resolve,reject)=>{ if(!info){ appendvideoOsdDanmakuInfo(); if(type!=='init') reject('播放器未完成加载'); else reject(null); } if(type!=='search' && type!=='reload' && window.ede.danmaku && window.ede.episode_info && window.ede.episode_info.episodeId===info.episodeId){ reject('当前播放视频未变动'); } else { window.ede.episode_info=info; resolve(info.episodeId);} }))
      .then(episodeId => getComments(episodeId).then(comments=> new Promise(res=>{ const check=()=>{ const c=getActiveContainer(); if(c) res(comments); else setTimeout(check,200); }; check(); }).then(cs=>createDanmaku(cs))), msg=>{ if(msg) console.log(msg); })
      .then(()=>{ window.ede.loading=false; const c=document.getElementById('danmakuCtr'); if(c) c.style.opacity=1; })
      .catch(err=>{ console.error('弹幕加载失败:', err); window.ede.loading=false; });
  }
  const debouncedCore = debounce((type)=>coreReloadDanmaku(type),300);
  function reloadDanmaku(type='check', immediate=false){ if(immediate){ debouncedCore.cancel(); coreReloadDanmaku(type); } else { debouncedCore(type); } }

  function danmakuFilter(comments){ // 保留旧接口兼容
    return applyAllFilters(comments);
  }

  // 统一过滤主入口（单次拷贝 + 早期退出）；保持旧子函数以便复用
  function applyAllFilters(base){
    if(!base||!base.length) return [];
    // 预取配置
    const typeFilters = localStorage.getItem('danmakuTypeFilter') ? JSON.parse(localStorage.getItem('danmakuTypeFilter')):[];
    const level = parseInt(localStorage.getItem('danmakuFilterLevel')||0);
    const hasType = typeFilters.length>0;
    const wordSet = window.ede._filterWordSet;
    const wordRe = window.ede._filterWordRegex;
    const filterEmoji = hasType && typeFilters.includes(danmakuTypeFilterOpts.emoji.id);
    const filterOnlyWhite = hasType && typeFilters.includes(danmakuTypeFilterOpts.onlyWhite.id);
    const filterRolling = hasType && typeFilters.includes(danmakuTypeFilterOpts.rolling.id);
    let whitelistModes = null; // modes to KEEP (if specific type filters selected besides special flags)
    if(hasType){
      const residual = typeFilters.filter(f=>!['emoji','onlyWhite','rolling'].includes(f));
      if(residual.length) whitelistModes = new Set(['top','bottom','ltr','rtl'].filter(m=> !residual.includes(m))); // Actually we filter OUT listed basic modes, so compute complement
    }
    const emojiRe = filterEmoji ? (window.ede._emojiRegex || (/x^/)) : null;
    const out=[];
    // 关键词与类型第一阶段过滤（不含密度）
  for(const c of base){
      if(!c) continue;
      // 类型过滤
      if(hasType){
        if(filterOnlyWhite && c.style && c.style.color && !c.style.color.toLowerCase().startsWith('#ffffff')){
          // onlyWhite 要求只保留白色 => 非白色过滤
          continue;
        }
        if(filterRolling && (c.mode==='ltr' || c.mode==='rtl')) continue;
        if(whitelistModes && !whitelistModes.has(c.mode)) continue; // mode 被排除
        if(emojiRe && emojiRe.test(c.text)) continue;
      }
      if(wordSet && wordSet.size){
        const lower = c._lc || c.text.toLowerCase();
        if(wordRe && wordRe.test(lower)) continue;
        let blocked = false;
        // 逐个匹配（少量关键词情况下可接受）
        for(const w of wordSet){ if(lower.includes(w)){ blocked=true; break; } }
        if(blocked) continue;
      }
      out.push(c);
    }
    if(level===0) return out;
    // 密度（沿用旧逻辑，但在 out 上处理，避免重复 lowerCase）
    return applyDensityFilter(out);
  }
  // 编译过滤资源（关键词集合 / 正则 / emoji 正则）
  function compileFilterResources(){ try {
      if(!window.ede.filterWords){ try { window.ede.filterWords = JSON.parse(localStorage.getItem('danmakuFilterWords')||'[]'); } catch{ window.ede.filterWords=[]; } }
      const words = (window.ede.filterWords||[]).map(w=> (w||'').toString().trim().toLowerCase()).filter(Boolean);
      window.ede._filterWordSet = new Set(words);
      // 构造简单安全正则（限制长度与字符范围以避免 ReDoS）
      const safeParts = [];
      for(const w of window.ede._filterWordSet){ if(w.length<=30 && /[a-z0-9\u4e00-\u9fa5]/i.test(w)) safeParts.push(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')); }
      window.ede._filterWordRegex = safeParts.length? new RegExp('(' + safeParts.join('|') + ')','i'): null;
      // Emoji 正则（支持属性的现代浏览器），失败则退回到基本区段范围
      if(!window.ede._emojiRegex){
        try { window.ede._emojiRegex = /[\p{Extended_Pictographic}]/u; if(!window.ede._emojiRegex.test('😀')) throw new Error('emoji test failed'); }
        catch{ try { window.ede._emojiRegex = /[\u{1F300}-\u{1FAFF}]/u; } catch { window.ede._emojiRegex = /[\uD800-\uDFFF]/; } }
      }
      window.ede._filterResourcesReady = true;
    } catch(e){ console.warn('编译过滤资源失败', e); }
  }
  function applyTypeFilters(list){ const typeFilters= localStorage.getItem('danmakuTypeFilter') ? JSON.parse(localStorage.getItem('danmakuTypeFilter')):[]; if(!typeFilters.length) return list; let filters=[...typeFilters]; if(filters.includes(danmakuTypeFilterOpts.onlyWhite.id)){ list=list.filter(c=> c.style && c.style.color && c.style.color.toLowerCase().startsWith('#ffffff')); filters=filters.filter(f=>f!==danmakuTypeFilterOpts.onlyWhite.id); }
    if(filters.includes(danmakuTypeFilterOpts.rolling.id)){ list=list.filter(c=> c.mode!=='ltr' && c.mode!=='rtl'); filters=filters.filter(f=>f!==danmakuTypeFilterOpts.rolling.id); }
    if(filters.includes(danmakuTypeFilterOpts.emoji.id)){
      if(!window.ede._emojiRegex) compileFilterResources();
      const re=window.ede._emojiRegex;
      if(re && re.test){ list=list.filter(c=> !re.test(c.text)); }
      filters=filters.filter(f=>f!==danmakuTypeFilterOpts.emoji.id);
    }
    if(filters.length){ list=list.filter(c=> !filters.includes(c.mode)); }
    return list; }
  function applyKeywordFilters(list){ const set=window.ede._filterWordSet; if(!set || !set.size) return list; const re=window.ede._filterWordRegex; return list.filter(c=>{ const lower=c.text.toLowerCase(); if(re && re.test(lower)) return false; // fallback 逐个
      for(const w of set){ if(lower.includes(w)) return false; } return true; }); }
  function applyDensityFilter(list){
    let level=parseInt(localStorage.getItem('danmakuFilterLevel')||0); if(level===0) return list;
    const limit = level===4 ? 3 : (9 - level*2);
    const vertical_limit = level===4 ? 2 : 6;
    const secCount = Object.create(null);
    const vertCount = Object.create(null); // 3s 窗口
    const out=[];
    for(let i=0;i<list.length;i++){
      const c=list[i]; const sec = Math.ceil(c.time); const vb = Math.ceil(c.time/3);
      let vc = vertCount[vb]||0; if(vc < vertical_limit){ vertCount[vb]=vc+1; } else { c.mode='rtl'; }
      let sc = secCount[sec]||0; if(sc < limit){ secCount[sec]=sc+1; out.push(c); }
    }
    return out;
  }

  function rebuildDanmakuFromParsed(){ if(!window.ede.parsedComments){ reloadDanmaku('reload'); return; } if(window.ede.danmaku){ window.ede.danmaku.clear(); window.ede.danmaku.destroy(); window.ede.danmaku=null; } const videoElement=getActiveVideo(); const container=getActiveContainer(); if(!videoElement || !container){ reloadDanmaku('reload'); return; } const filtered=applyAllFilters(window.ede.parsedComments); const savedSpeed = parseInt(localStorage.getItem('danmakuSpeed')) || 200; window.ede.danmaku=new Danmaku({container,media:videoElement,comments:filtered,engine:'canvas',speed:savedSpeed}); window.ede.filteredComments=filtered; (function buildSecondIndex(){ try { if(!filtered.length){ window.ede._countsBySecond=null; return; } const dur = Math.max(videoElement.duration||0, filtered[filtered.length-1].time|0)+2; const arr=new Array(Math.ceil(dur)+1).fill(0); for(const c of filtered){ const si = c.time|0; if(si>=0 && si<arr.length) arr[si]++; } window.ede._countsBySecond = arr; } catch(e){ window.ede._countsBySecond=null; } })(); appendvideoOsdDanmakuInfo(filtered.length); window.ede.danmakuSwitch==1? window.ede.danmaku.show() : window.ede.danmaku.hide(); buildDanmakuDensityData(); renderDanmakuTimeline(); }

  function onFilterConfigChanged(){ compileFilterResources(); // 关键词/高级过滤/等级变化
    if(window.ede.parsedComments && window.ede.danmaku){ rebuildDanmakuFromParsed(); } else { reloadDanmaku('reload'); } }

  // 动态密度监控（自适应调度 setTimeout，减少空闲周期唤醒）
  function startDynamicDensityMonitor(){ if(window.ede._densityTimer) return; window.ede._dynamicAdjust={active:false, origLevel:null, origSpeed:null, lastChange:0};
    const tick=()=>{ const dm=window.ede.danmaku; if(!dm||!dm.media){ window.ede._densityTimer=setTimeout(tick,4000); return; } const ct=dm.media.currentTime; let upcoming=0; const counts=window.ede._countsBySecond; if(counts){ const s=Math.floor(ct); const end=Math.min(counts.length-1, s+5); for(let i=s;i<=end;i++) upcoming+=counts[i]||0; }
      const high=120, low=40; const now=nowSec(); const cool=2; // 2s 冷却
      if(!window.ede._dynamicAdjust.active && upcoming>high && now-window.ede._dynamicAdjust.lastChange>cool){ const level=parseInt(localStorage.getItem('danmakuFilterLevel')||0); if(level<4){ window.ede._dynamicAdjust.origLevel=level; localStorage.setItem('danmakuFilterLevel', level+1); }
        const sp=dm.speed; window.ede._dynamicAdjust.origSpeed=sp; const newSpeed=Math.max(60, Math.round(sp*0.7)); if(newSpeed!==sp) dm.speed=newSpeed; window.ede._dynamicAdjust.active=true; window.ede._dynamicAdjust.lastChange=now; showTooltip('弹幕拥挤: 已临时调整过滤/速度'); onFilterConfigChanged(); }
      else if(window.ede._dynamicAdjust.active && upcoming<low && now-window.ede._dynamicAdjust.lastChange>cool){ if(window.ede._dynamicAdjust.origLevel!=null) localStorage.setItem('danmakuFilterLevel', window.ede._dynamicAdjust.origLevel); if(window.ede._dynamicAdjust.origSpeed!=null) dm.speed=window.ede._dynamicAdjust.origSpeed; window.ede._dynamicAdjust={active:false, origLevel:null, origSpeed:null, lastChange:now}; showTooltip('弹幕恢复正常'); onFilterConfigChanged(); }
      let next=7000; if(upcoming>high) next=3000; else if(window.ede._dynamicAdjust.active) next=4000; else if(upcoming<low) next=8000; window.ede._densityTimer=setTimeout(tick,next); };
    window.ede._densityTimer=setTimeout(tick,3000);
  }

  function danmakuParser(arr){
    if(!arr||!arr.length) return [];
    const fontSize = parseInt(localStorage.getItem('danmakuFontSize')) || (isMobile?fontSizeMobile:fontSizeDesktop);
    const fontDecl = `${fontSize}px sans-serif`;
    const whiteShadow='-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000';
    const blackShadow='-1px -1px #fff, -1px 1px #fff, 1px -1px #fff, 1px 1px #fff';
    const modeMap={6:'ltr',1:'rtl',5:'top',4:'bottom'};
    const out=new Array(arr.length); let oIdx=0; let id=0;
    for(let i=0;i<arr.length;i++){
      const c=arr[i]; if(!c||!c.p) continue; const values=c.p.split(','); const mode=modeMap[values[1]]; if(!mode) continue; const colorHex=`000000${Number(values[2]).toString(16)}`.slice(-6); const isBlack = colorHex==='000000'; out[oIdx++]={ id:id++, text:c.m, mode, time:+values[0], style:{ fontSize:`${fontSize}px`, color:`#${colorHex}`, textShadow: isBlack?blackShadow:whiteShadow, font:fontDecl, fillStyle:`#${colorHex}`, strokeStyle: isBlack? '#fff':'#000', lineWidth:2 } }; }
    out.length=oIdx; return out;
  }

  // ===== 还原后续原功能代码 (搜索、过滤设置、日志、UI 对话框) =====
  // (移除未使用的 list2string / ep2string 以减小体积)

  const searchAnimeTemplateHtml = `
    <div style="display: flex; flex-direction: column; padding: 2em; background: rgba(31, 31, 31, 0.95);
         color: #fff; border-radius: 16px; backdrop-filter: blur(20px); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);">
      <div style="display: flex; margin-bottom: 2em; justify-content: space-between;">
        <div style="display: flex; flex: 1; background: rgba(255, 255, 255, 0.1); border-radius: 8px; overflow: hidden;">
          <input type="search" is="emby-input" id="danmakuSearchName"
            class="emby-input" placeholder="搜索..."
            style="background: transparent; color: #fff; border: none; flex: 1; padding: 0.7em 1em;">
          <button is="emby-button" id="danmakuSearchBtn" class="paper-icon-button-light"
            title="搜索" style="color: #fff; padding: 0 1em; background: rgba(255, 255, 255, 0.1);">
            <span class="md-icon">${search_icon}</span>
          </button>
          <button is="emby-button" id="danmakuToggleTitle" class="paper-icon-button-light"
            title="使用原语言标题（Original Title）搜索" style="color: #fff; padding: 0 1em; background: rgba(255, 255, 255, 0.1);">
            <span class="md-icon">${translate_icon}</span>
          </button>
        </div>
        <button is="emby-button" id="closeSearchDialog" class="paper-icon-button-light"
          title="关闭" style="color: #fff; margin-left: 1em;">
          <span class="md-icon">close</span>
        </button>
      </div>

      <div id="danmakuAnimeSelect" style="display: none;">
        <div style="display: flex; gap: 2em;">
          <div style="flex: 1;">
            <div style="margin-bottom: 1.5em;">
              <label style="display: block; color: #00a4dc; font-size: 1.1em; margin-bottom: 0.5em;">媒体名</label>
              <select is="emby-select" id="animeSelect" class="emby-select"
                style="background: rgba(255, 255, 255, 0.1); color: #fff; border: none; border-radius: 8px;
                       padding: 0.7em; width: 100%; transition: all 0.2s ease;">
              </select>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 1em;">
              <div style="flex: 1;">
                <label style="display: block; color: #00a4dc; font-size: 1.1em; margin-bottom: 0.5em;">分集名</label>
                <select is="emby-select" id="episodeSelect" class="emby-select"
                  style="background: rgba(255, 255, 255, 0.1); color: #fff; border: none; border-radius: 8px;
                         padding: 0.7em; width: 100%; transition: all 0.2s ease;">
                </select>
              </div>
              <button is="emby-button" id="danmakuSwitchEpisode"
                class="paper-icon-button-light" title="加载弹幕"
                style="color: #00a4dc; background: rgba(0, 164, 220, 0.2); padding: 0.7em 1.5em;
                       border-radius: 8px; transition: all 0.2s ease;">
                <span class="md-icon" style="margin-right: 0.5em;">done</span>
                <span>加载</span>
              </button>
            </div>
          </div>
          <div id="animeImgContainer" style="width: 120px; height: 168px; flex-shrink: 0; display: none;">
            <img id="animeImg" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;
                 box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);"
                 loading="lazy" decoding="async">
          </div>
        </div>
        <div id="noResultsMsg" style="color: #fff; margin-top: 1em; text-align: center; display: none;"></div>
      </div>
    </div>`;

  function showSearchDialog() {
    const dialog = document.createElement('dialog');
    dialog.style = 'border: 0; width: 40%; min-width: 320px; max-width: 800px; background: transparent; padding: 0;';
    dialog.innerHTML = searchAnimeTemplateHtml;
    document.body.appendChild(dialog);
    unifyDialog(dialog,'搜索弹幕');
    const style = document.createElement('style');
    style.textContent = `
      .emby-select:hover, .emby-input:hover { background: rgba(255,255,255,0.15)!important; }
      .emby-select:focus, .emby-input:focus { background: rgba(255,255,255,0.2)!important; outline:none; }
      #danmakuSwitchEpisode:hover { background: rgba(0,164,220,0.3)!important; transform: translateY(-1px); }
      #danmakuSearchBtn:hover, #danmakuToggleTitle:hover { background: rgba(255,255,255,0.2)!important; }
      .noResults { padding:2em;text-align:center;background:rgba(255,255,255,0.1);border-radius:8px;margin-top:1em; }
    `;
    document.head.appendChild(style);
    const searchInput = dialog.querySelector('#danmakuSearchName');
    const closeBtn = dialog.querySelector('#closeSearchDialog');
  const searchBtn = dialog.querySelector('#danmakuSearchBtn');
  const setSearchLoading=(l)=>{ if(l){ searchBtn.disabled=true; if(!searchBtn.dataset._orig) searchBtn.dataset._orig=searchBtn.innerHTML; searchBtn.innerHTML='<span class="md-icon" style="animation:ede-spin 1s linear infinite;">autorenew</span>'; } else { searchBtn.disabled=false; if(searchBtn.dataset._orig){ searchBtn.innerHTML=searchBtn.dataset._orig; } } };
  if(!document.getElementById('ede-spin-style')){ const st=document.createElement('style'); st.id='ede-spin-style'; st.textContent='@keyframes ede-spin{from{transform:rotate(0);}to{transform:rotate(360deg);}}'; document.head.appendChild(st); }
    const toggleBtn = dialog.querySelector('#danmakuToggleTitle');
    const selectDiv = dialog.querySelector('#danmakuAnimeSelect');
    const animeSelect = dialog.querySelector('#animeSelect');
    const episodeSelect = dialog.querySelector('#episodeSelect');
    const switchBtn = dialog.querySelector('#danmakuSwitchEpisode');
    const noResultsMsg = dialog.querySelector('#noResultsMsg');
  let currentAnimeInfo = null; let searchPromise = null; let fallbackTried = false; let fallbackUsed = false;
    if (window.ede._searchName) searchInput.value = window.ede._searchName;
    closeBtn.onclick = () => { if (searchPromise && searchPromise.cancel) searchPromise.cancel(); dialog.remove(); };
    dialog.addEventListener('close', ()=>{ if (searchPromise && searchPromise.cancel) searchPromise.cancel(); dialog.remove(); });
    searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter') searchBtn.click(); });
  searchBtn.onclick = async () => {
      const searchName = searchInput.value.trim(); if(!searchName) return;
      if(searchPromise && searchPromise.cancel) searchPromise.cancel();
      selectDiv.style.display='block';
      try {
    setSearchLoading(true);
        searchPromise = searchAnime(searchName);
        currentAnimeInfo = await searchPromise;
        if(!currentAnimeInfo || currentAnimeInfo.animes.length===0){
          // 自动回退：若首次使用当前输入（通常是中文）未命中，则尝试 Emby 的原语言标题
          if(!fallbackTried){
            const item = await getEmbyItemInfo();
            let originalCandidate = '';
            if(item){
              if(item.OriginalTitle) originalCandidate = item.OriginalTitle;
              else if(item.Type==='Episode' && item.SeriesName){
                try { const series = await ApiClient.getItem(ApiClient.getCurrentUserId(), item.SeriesId); if(series && series.OriginalTitle) originalCandidate = series.OriginalTitle; } catch(e){}
              }
            }
            if(originalCandidate && originalCandidate.trim() && originalCandidate.toLowerCase()!==searchName.toLowerCase()){
              fallbackTried = true;
              searchInput.value = originalCandidate.trim();
              noResultsMsg.className='noResults'; noResultsMsg.style.display='block';
              noResultsMsg.textContent='未找到匹配结果，尝试原语言标题...';
        setSearchLoading(false);
              // 触发第二次搜索
              searchBtn.click();
              return;
            }
          }
          noResultsMsg.className='noResults'; noResultsMsg.style.display='block'; noResultsMsg.textContent='未找到匹配结果'; animeSelect.innerHTML=''; episodeSelect.innerHTML=''; return;
        }
        noResultsMsg.style.display='none';
        updateAnimeSelects(currentAnimeInfo, animeSelect, episodeSelect);
        updateAnimeImg(currentAnimeInfo.animes[0].animeId);
        if(window.ede._currentEpisode!==undefined) episodeSelect.value = window.ede._currentEpisode;
        animeSelect.onchange = () => { const selectedAnime=currentAnimeInfo.animes[animeSelect.value]; updateEpisodeSelect(selectedAnime); updateAnimeImg(selectedAnime.animeId); };
        if(fallbackTried && !fallbackUsed){ fallbackUsed = true; showTooltip('已使用原语言标题匹配到结果'); }
      } catch(err){ if(err.name==='AbortError') console.log('Search canceled'); else { console.error(err); noResultsMsg.textContent='搜索失败: '+err.message; } }
    finally { setSearchLoading(false); }
    };
    toggleBtn.onclick = async () => {
      const item = await getEmbyItemInfo();
      if(item){ if(item.OriginalTitle) searchInput.value=item.OriginalTitle; else if(item.Type==='Episode' && item.SeriesName){ const series = await ApiClient.getItem(ApiClient.getCurrentUserId(), item.SeriesId); if(series && series.OriginalTitle) searchInput.value=series.OriginalTitle; }
        searchBtn.click(); }
    };
    switchBtn.onclick = async () => {
      if(!currentAnimeInfo) return;
      try {
        const selectedAnime = currentAnimeInfo.animes[animeSelect.value];
        const selectedEpisode = selectedAnime.episodes[episodeSelect.value];
        const episodeInfo = { episodeId:selectedEpisode.episodeId, animeTitle:selectedAnime.animeTitle, episodeTitle: selectedAnime.type==='tvseries'? selectedEpisode.episodeTitle:null };
        const item = await getEmbyItemInfo();
        if(item){ const _id=item.Type==='Episode'?item.SeasonId:item.Id; const episode=item.Type==='Episode'?item.IndexNumber:'movie'; const _episode_key = '_episode_id_rel_' + _id + '_' + episode; localStorage.setItem(_episode_key, JSON.stringify(episodeInfo)); }
        window.ede.episode_info = episodeInfo; dialog.remove(); reloadDanmaku('reload');
      } catch(err){ console.error('Failed to switch episode:', err); noResultsMsg.textContent='切换失败: '+err.message; }
    };
    searchBtn.click(); dialog.showModal();
  }
  async function searchAnime(name){ const controller=new AbortController(); const signal=controller.signal; try { const proxyServer=window.ede.customProxyServer || defaultProxyServers[window.ede.currentProxyIndex]; const url=`${proxyServer}api/v2/search/episodes?anime=${encodeURIComponent(name)}`; const promise = fetch(url,{signal}).then(r=>r.json()).catch(e=>{ if(e.name==='AbortError') throw e; console.log('查询失败:',e); return null; }); promise.cancel=()=>controller.abort(); return promise; } catch(err){ console.error('Search failed:',err); throw err; } }
  function updateAnimeSelects(animeInfo, animeSelect, episodeSelect){ animeSelect.innerHTML=''; animeInfo.animes.forEach((anime,idx)=>{ const opt=document.createElement('option'); opt.value=idx; opt.textContent=`${anime.animeTitle} (${anime.typeDescription})`; animeSelect.appendChild(opt); }); updateEpisodeSelect(animeInfo.animes[0]); }
  function updateEpisodeSelect(anime){ const episodeSelect=document.querySelector('#episodeSelect'); if(!episodeSelect) return; episodeSelect.innerHTML=''; if(!anime||!anime.episodes||anime.episodes.length===0) return; anime.episodes.forEach((ep,idx)=>{ const opt=document.createElement('option'); opt.value=idx; opt.textContent= ep.episodeTitle || `第${idx+1}话`; episodeSelect.appendChild(opt); }); }
  function updateAnimeImg(animeId){ const imgContainer=document.querySelector('#animeImgContainer'); const animeImg=document.querySelector('#animeImg'); if(!imgContainer||!animeImg) return; imgContainer.style.display='block'; animeImg.src=`https://img.dandanplay.net/anime/${animeId}.jpg`; }

  const videoOsdDanmakuInfoStyle = 'margin-left: auto; white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; position: absolute; right: 0px; bottom: 0px;';
  function appendvideoOsdDanmakuInfo(loadSum){ const episode_info=window.ede.episode_info||{}; const {episodeId, animeTitle, episodeTitle}=episode_info; const videoOsdContainer=document.querySelector(`${mediaContainerQueryStr} .videoOsdSecondaryText`); let videoOsdDanmakuTitle=document.getElementById('videoOsdDanmakuTitle'); if(!videoOsdDanmakuTitle){ videoOsdDanmakuTitle=document.createElement('h3'); videoOsdDanmakuTitle.id='videoOsdDanmakuTitle'; videoOsdDanmakuTitle.classList.add('videoOsdTitle'); videoOsdDanmakuTitle.style=videoOsdDanmakuInfoStyle; videoOsdDanmakuTitle.style.display=window.ede.showDanmakuInfo?'block':'none'; }
    let text='弹幕：'; if(episodeId){ text+=`${animeTitle} - ${episodeTitle||''} - ${loadSum||0}/${window.ede.originalCount}条`; } else { text+='未匹配'; }
    videoOsdDanmakuTitle.innerText=text; if(videoOsdContainer) videoOsdContainer.append(videoOsdDanmakuTitle); }
  function getDanmakuComments(ede){ return ede.danmaku && ede.danmaku.comments ? ede.danmaku.comments : []; }

  // showFilterDialog 旧函数已弃用，入口合并到弹幕中心

  function showLogDialog(){ const html=`<div style=\"display:flex;flex-direction:column;gap:1em;\">\n<div style=\"display:flex;justify-content:space-between;align-items:center;\"><h3 style=\"margin:0;\">调试日志</h3><div style=\"display:flex;gap:.5em;\"><button is=\"emby-button\" id=\"toggleLogContent\" class=\"paper-icon-button-light\" title=\"展开/折叠日志\"><span class=\"md-icon\">expand_more</span></button><button is=\"emby-button\" id=\"closeLogDialog\" class=\"paper-icon-button-light\" title=\"关闭\"><span class=\"md-icon\">close</span></button></div></div>\n<div id=\"logContent\" style=\"display:none;white-space:pre-wrap;background:#333;padding:1em;max-height:400px;overflow-y:auto;\"></div>\n<div><button is=\"emby-button\" id=\"toggleMoreSettings\" class=\"raised\" style=\"width:100%;margin-bottom:1em;text-align:left;padding:0.7em;\"><span class=\"md-icon\" style=\"margin-right:0.5em;\">settings</span>更多设置<span class=\"md-icon\" style=\"margin-left:auto;\">expand_more</span></button><div id=\"moreSettings\" style=\"display:none;background:rgba(255,255,255,0.05);padding:1em;border-radius:8px;\">\n<div style=\"margin-bottom:1em;\"><label style=\"display:flex;align-items:center;margin-bottom:1em;\"><input type=\"checkbox\" is=\"emby-checkbox\" id=\"cacheEnabledCheckbox\"><span style=\"margin-left:0.5em;\">启用缓存</span></label></div>\n<div class=\"setting-section\" style=\"margin-bottom:1em;\"><button is=\"emby-button\" id=\"toggleButtonOrder\" class=\"raised\" style=\"width:100%;text-align:left;padding:0.7em;margin-bottom:1em;\"><span class=\"md-icon\" style=\"margin-right:0.5em;\">sort</span>功能排序<span class=\"md-icon\" style=\"margin-left:auto;\">expand_more</span></button><div id=\"buttonOrderContainer\" style=\"display:none;padding:1em;background:rgba(0,0,0,0.2);border-radius:8px;\"></div></div>\n<div class=\"setting-section\"><button is=\"emby-button\" id=\"toggleProxySettings\" class=\"raised\" style=\"width:100%;text-align:left;padding:0.7em;margin-bottom:1em;\"><span class=\"md-icon\" style=\"margin-right:0.5em;\">dns</span>代理设置<span class=\"md-icon\" style=\"margin-left:auto;\">expand_more</span></button>\n<div id=\"proxySettingsContainer\" style=\"display:none;padding:1em;background:rgba(0,0,0,0.2);border-radius:8px;\">\n<div style=\"display:flex;flex-direction:column;gap:0.5em;\">\n<label><input type=\"radio\" name=\"proxyType\" value=\"default\" ${!window.ede.customProxyServer?'checked':''}> 使用默认代理服务器</label>\n<div style=\"display:flex;align-items:center;gap:0.5em;\"><label><input type=\"radio\" name=\"proxyType\" value=\"custom\" ${window.ede.customProxyServer?'checked':''}> 自定义代理服务器</label><input type=\"text\" is=\"emby-input\" id=\"customProxyInput\" value=\"${window.ede.customProxyServer}\" placeholder=\"https://your-proxy-server/\" style=\"flex:1;${!window.ede.customProxyServer?'opacity:0.5;':''}\"></div></div></div></div></div>\n<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.5em;\"><button is=\"emby-button\" id=\"refreshLogBtn\" class=\"raised\">刷新日志</button><button is=\"emby-button\" id=\"copyLogBtn\" class=\"raised\">复制日志</button><button is=\"emby-button\" id=\"testCorsBtn\" class=\"raised\">测试CORS</button><button is=\"emby-button\" id=\"clearCacheBtn\" class=\"raised\">清除缓存</button></div>`; const dialog=document.createElement('dialog'); dialog.style='border:0;width:80%;max-width:800px;background:transparent;padding:0;'; dialog.innerHTML=html; document.body.appendChild(dialog); unifyDialog(dialog,'调试日志');
    const toggleLogBtn=dialog.querySelector('#toggleLogContent'); const logContent=dialog.querySelector('#logContent'); const toggleMoreBtn=dialog.querySelector('#toggleMoreSettings'); const moreSettings=dialog.querySelector('#moreSettings'); const toggleButtonOrderBtn=dialog.querySelector('#toggleButtonOrder'); const buttonOrderContainer=dialog.querySelector('#buttonOrderContainer'); const toggleProxySettingsBtn=dialog.querySelector('#toggleProxySettings'); const proxySettingsContainer=dialog.querySelector('#proxySettingsContainer');
    function setupToggle(btn, content){ btn.onclick=()=>{ const open=content.style.display!=='none'; content.style.display=open?'none':'block'; const icon=btn.querySelector('.md-icon:last-child'); if(icon) icon.textContent=open?'expand_more':'expand_less'; }; }
    setupToggle(toggleLogBtn, logContent); setupToggle(toggleMoreBtn, moreSettings); setupToggle(toggleButtonOrderBtn, buttonOrderContainer); setupToggle(toggleProxySettingsBtn, proxySettingsContainer);
    const refreshLog=()=>{ logContent.textContent=generateLogContent(); }; refreshLog(); if(buttonOrderContainer) updateButtonOrderList(buttonOrderContainer);
    const proxyTypeInputs=dialog.querySelectorAll('input[name="proxyType"]'); const customProxyInput=dialog.querySelector('#customProxyInput');
    proxyTypeInputs.forEach(input=>{ input.addEventListener('change',()=>{ if(input.value==='default'){ window.ede.customProxyServer=''; customProxyInput.value=''; customProxyInput.style.opacity='0.5'; localStorage.removeItem('danmakuCustomProxy'); window.ede.currentProxyIndex=0; localStorage.setItem('danmakuProxyIndex',0); showTooltip('已切换至默认代理服务器'); } else { customProxyInput.style.opacity='1'; } }); });
    let proxyUpdateTimeout; customProxyInput.addEventListener('input',()=>{ clearTimeout(proxyUpdateTimeout); proxyUpdateTimeout=setTimeout(()=>{ const v=customProxyInput.value.trim(); if(v && v!==window.ede.customProxyServer){ window.ede.customProxyServer=v; localStorage.setItem('danmakuCustomProxy', v); showTooltip('已更新自定义代理服务器'); } },1000); });
    dialog.querySelector('#refreshLogBtn').onclick=refreshLog;
    dialog.querySelector('#copyLogBtn').onclick=()=>{ try { const txt=generateLogContent(); const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showTooltip('日志已复制到剪贴板'); } catch(e){ console.error(e); showTooltip('复制失败','error'); } };
    dialog.querySelector('#testCorsBtn').onclick=async ()=>{ try { const btn=dialog.querySelector('#testCorsBtn'); btn.disabled=true; btn.textContent='测试中...'; window.ede.corsStatus='测试中...'; const proxyServer=window.ede.customProxyServer || defaultProxyServers[window.ede.currentProxyIndex]; const testUrl=`${proxyServer}api/v2/search/episodes?anime=test`; const resp=await fetch(testUrl); const data=await resp.json(); if(resp.ok && data){ window.ede.corsStatus='正常'; window.ede.lastApiResponse=JSON.stringify(data).slice(0,100)+'...'; showTooltip('CORS测试通过'); } else { window.ede.corsStatus='异常: API响应无效'; window.ede.lastApiResponse=JSON.stringify(data); showTooltip('CORS测试失败','error'); } } catch(err){ window.ede.corsStatus='异常: '+err.message; window.ede.lastError=err.stack; window.ede.lastApiResponse='Error: '+err.message; showTooltip('CORS测试失败: '+err.message,'error'); } finally { const btn=dialog.querySelector('#testCorsBtn'); btn.disabled=false; btn.textContent='测试CORS'; const lc=dialog.querySelector('#logContent'); if(lc) lc.textContent=generateLogContent(); } };
    dialog.querySelector('#clearCacheBtn').onclick=()=>{ const keys=Object.keys(localStorage); let count=0; for(const k of keys){ if(k.startsWith('_danmaku_cache_')||k.startsWith('_search_cache_')||k.startsWith('_search_lock_')){ localStorage.removeItem(k); count++; } } showTooltip(`已清除 ${count} 条缓存记录`); logContent.textContent=generateLogContent(); };
    dialog.querySelector('#closeLogDialog').onclick=()=>dialog.remove(); dialog.showModal();
    const cacheEnabledCheckbox=dialog.querySelector('#cacheEnabledCheckbox'); cacheEnabledCheckbox.checked=window.ede.cacheEnabled; cacheEnabledCheckbox.addEventListener('change',()=>{ window.ede.cacheEnabled=cacheEnabledCheckbox.checked; localStorage.setItem('danmakuCacheEnabled', cacheEnabledCheckbox.checked); });
  }
  function generateLogContent(){ const proxyServer=window.ede.customProxyServer || '默认服务器'; let cacheSize=0; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k.startsWith('_danmaku_cache_')||k.startsWith('_search_cache_')) cacheSize+=localStorage.getItem(k).length; }
    return `User Agent: ${navigator.userAgent}\n移动设备: ${isMobile}\n视频元素: ${!!document.querySelector(mediaQueryStr)}\n视频状态: ${document.querySelector(mediaQueryStr)?.readyState}\n弹幕状态: ${!!window.ede?.danmaku}\n原始弹幕数: ${window.ede?.originalCount || 0}\n当前弹幕数: ${window.ede?.danmaku?.comments?.length || 0}\n媒体容器: ${!!document.querySelector(mediaContainerQueryStr)}\n弹幕开关: ${window.ede?.danmakuSwitch}\n全局透明度: ${globalOpacity}\n简繁转换: ${window.ede?.chConvert}\n加载状态: ${window.ede?.loading}\n当前播放信息: ${JSON.stringify(window.ede?.episode_info, null, 2)}\n字体大小: ${isMobile?fontSizeMobile:fontSizeDesktop}px\n当前代理: ${proxyServer}\n最后错误: ${window.ede?.lastError || '无'}\nCORS状态: ${window.ede?.corsStatus || '未测试'}\n自动匹配状态: ${window.ede?.autoMatchStatus || '未开始'}\nAPI响应: ${window.ede?.lastApiResponse || '无'}\n缓存信息:\n- 搜索缓存: ${Object.keys(localStorage).filter(k=>k.startsWith('_search_cache_')).length} 条\n- 弹幕缓存: ${Object.keys(localStorage).filter(k=>k.startsWith('_danmaku_cache_')).length} 条\n- 总大小: ${(cacheSize/1024/1024).toFixed(2)} MB`; }

  // 旧 showDanmakuSettingsDialog 已移除，功能整合至弹幕中心 appearance

  // ===== 统一弹幕中心面板 (分级菜单 + 外显按钮管理) =====
  function showDanmakuCenterDialog(initialSection){
    if(document.getElementById('danmakuCenterDialog')) return;
    const state={
      font: localStorage.getItem('danmakuFontSize') || (isMobile?fontSizeMobile:fontSizeDesktop),
      opacity: localStorage.getItem('danmakuTransparencyLevel') || '100',
      speed: localStorage.getItem('danmakuSpeed') || '200',
      filterLevel: localStorage.getItem('danmakuFilterLevel') || '0',
      timeline: (localStorage.getItem('danmakuTimelineEnabled') !== 'false'),
      chConvert: localStorage.getItem('chConvert') || '1',
      compact: window.ede.compactUI,
      external: [...(window.ede.externalButtons||[])]
    };
  const featureMap={ filteringDanmaku:'过滤等级', danmakuSettings:'弹幕设置', switchDanmakuInfo:'信息显示', searchDanmaku:'搜索', danmakuHeatmap:'热度图', showDanmakuLog:'日志' };
    const navItems=[
      {id:'overview',label:'概览'},
      {id:'appearance',label:'外观'},
      {id:'filter',label:'过滤'},
      {id:'functions',label:'功能'},
      {id:'layout',label:'布局'},
      {id:'advanced',label:'高级'}
    ];
    const dialog=document.createElement('dialog'); dialog.id='danmakuCenterDialog'; dialog.style='border:0;padding:0;background:transparent;';
    dialog.innerHTML=`<div class="dc-shell" style="display:flex;min-width:780px;max-width:880px;max-height:72vh;background:rgba(22,22,24,.95);backdrop-filter:blur(18px);border-radius:18px;overflow:hidden;color:#fff;font-size:14px;">
      <style id="dc-style">.dc-nav{width:150px;background:rgba(255,255,255,.04);display:flex;flex-direction:column;padding:10px 0;}
      .dc-nav-btn{appearance:none;border:0;background:none;color:#ddd;text-align:left;padding:10px 16px;font:inherit;cursor:pointer;display:flex;align-items:center;gap:.5em;border-left:3px solid transparent;transition:.18s;}
      .dc-nav-btn.active{background:rgba(255,255,255,.08);color:#fff;border-left-color:#00a4dc;font-weight:600;}
      .dc-nav-btn:hover{background:rgba(255,255,255,.12);color:#fff;}
      .dc-body{flex:1;display:flex;flex-direction:column;overflow:hidden;}
      .dc-header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.07);}
      .dc-content{flex:1;overflow:auto;padding:16px 22px;}
      .dc-section{display:none;animation:fade .18s ease;}
      .dc-section.active{display:block;}
      .dc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;}
      .dc-card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;}
      .dc-card h4{margin:0 0 4px 0;font-size:13px;letter-spacing:.5px;color:#00a4dc;font-weight:600;}
      .range-line{display:flex;align-items:center;justify-content:space-between;gap:8px;}
      .range-line input[type=range]{flex:1;}
      .badge{display:inline-block;padding:2px 6px;font-size:11px;border-radius:4px;background:#00a4dc22;color:#00c8ff;margin-left:6px;}
      .kv{font-size:12px;line-height:1.4;white-space:pre-line;}
      .feature-list{display:flex;flex-wrap:wrap;gap:6px;}
      .feat-btn{padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.09);cursor:pointer;font-size:12px;}
      .feat-btn:hover{background:rgba(255,255,255,.15);}
      .ext-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}
      .ext-item{background:rgba(255,255,255,.07);padding:6px 8px;border-radius:8px;display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;}
      .ext-item input{margin:0;}
      .note{font-size:11px;opacity:.65;line-height:1.5;}
      .toolbar-small{display:flex;gap:6px;}
      .toolbar-small button{background:rgba(255,255,255,.08);border:0;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit;font-size:12px;}
      .toolbar-small button:hover{background:rgba(255,255,255,.15);}
      @keyframes fade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}
      </style>
      <div class="dc-nav" id="dcNav"></div>
      <div class="dc-body">
        <div class="dc-header"><div style="display:flex;align-items:center;gap:10px;">
          <strong style="font-size:15px;display:flex;align-items:center;gap:6px;">弹幕中心</strong>
        </div><div class="toolbar-small"><button id="dcReload" title="重载"><span class="md-icon">autorenew</span></button><button id="dcClose" title="关闭"><span class="md-icon">close</span></button></div></div>
        <div class="dc-content" id="dcContent">
          ${navItems.map(n=>`<section class='dc-section' id='sec-${n.id}' data-sec='${n.id}'></section>`).join('')}
        </div>
      </div>
    </div>`;
    document.body.appendChild(dialog); dialog.showModal();

    // 构建导航
    const navEl=dialog.querySelector('#dcNav');
    navItems.forEach(item=>{ const b=document.createElement('button'); b.className='dc-nav-btn'; b.textContent=item.label; b.dataset.target=item.id; b.onclick=()=>switchSection(item.id); navEl.appendChild(b); });
  function switchSection(id){ dialog.querySelectorAll('.dc-nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.target===id)); dialog.querySelectorAll('.dc-section').forEach(s=> s.classList.toggle('active', s.dataset.sec===id)); if(id==='filter' && !secBuilt.filter) buildFilter(); if(id==='appearance' && !secBuilt.appearance) buildAppearance(); if(id==='functions' && !secBuilt.functions) buildFunctions(); if(id==='layout' && !secBuilt.layout) buildLayout(); if(id==='advanced' && !secBuilt.advanced) buildAdvanced(); if(id==='overview' && !secBuilt.overview) buildOverview(); }

    const secBuilt={};
    const qs=id=>dialog.querySelector(id);

    function paintRangeInput(r,color='#00a4dc'){ if(!r) return; const v=(r.value-r.min)/(r.max-r.min)*100; r.style.background=`linear-gradient(to right, ${color} 0%, ${color} ${v}%, #444 ${v}%, #444 100%)`; }

    function buildOverview(){ secBuilt.overview=true; const epi=window.ede.episode_info; const sec=qs('#sec-overview'); const cntCur=window.ede?.danmaku?.comments?.length||0; const cntOrig=window.ede.originalCount||0; sec.innerHTML=`<div class='dc-grid'><div class='dc-card'><h4>状态</h4><div class='kv' id='dcStatusKV'></div><div class='note'>实时刷新，显示匹配 / 过滤 / 缓存与代理状态。</div></div><div class='dc-card'><h4>操作</h4><div class='feature-list'><div class='feat-btn' id='ovSearch'>搜索</div><div class='feat-btn' id='ovHeatmap'>热度图</div><div class='feat-btn' id='ovLog'>日志</div><div class='feat-btn' id='ovReload'>重载弹幕</div></div><div class='note'>常用功能快速入口。</div></div></div>`; const status=sec.querySelector('#dcStatusKV'); function refresh(){ status.textContent=`匹配: ${epi? (epi.animeTitle+(epi.episodeTitle?(' - '+epi.episodeTitle):'')):'未匹配'}\n弹幕: ${cntCur}/${cntOrig} (过滤:${localStorage.getItem('danmakuFilterLevel')||0})\n缓存: ${window.ede.cacheEnabled?'启用':'关闭'}  代理:${window.ede.customProxyServer||'默认'}\n外显按钮: ${(window.ede.externalButtons||[]).length}`; } refresh(); sec.querySelector('#ovSearch').onclick=showSearchDialog; sec.querySelector('#ovHeatmap').onclick=showHeatmapDialog; sec.querySelector('#ovLog').onclick=showLogDialog; sec.querySelector('#ovReload').onclick=()=>reloadDanmaku('reload',true); }

    function buildAppearance(){
      secBuilt.appearance=true; const sec=qs('#sec-appearance');
      const makeLine=(id,label,min,max,step,val,unit='')=>`<div class='range-line' data-r='${id}'><span class='lbl'>${label}</span><input type='range' id='${id}' min='${min}' max='${max}' step='${step}' value='${val}'><span class='num' id='${id}Num'></span><span class='unit'>${unit}</span></div>`;
  sec.innerHTML=`<div class='dc-grid'><div class='dc-card'><div style='display:flex;align-items:center;justify-content:space-between;'><h4 style='margin:0;'>基础参数</h4><button id='apReset' class='ede-reset-btn' title='恢复默认'><span class='md-icon' style='font-size:16px;'>${reset_icon}</span><span class='lbl' style='font-size:12px;letter-spacing:.5px;'>重置</span></button></div>
        ${makeLine('apFont','字体',12,48,1,state.font,'px')}
        ${makeLine('apOpacity','不透明',0,100,1,state.opacity,'%')}
  ${makeLine('apSpeed','速度',60,300,5,state.speed,'')}
  ${makeLine('apTimelineOp','进度透明',10,100,1, localStorage.getItem('edeTimelineOpacity')||85, '%')}
        <div class='toggle-line' style='display:flex;flex-wrap:wrap;gap:1em;margin-top:4px;'><label style='font-size:12px;display:flex;align-items:center;gap:4px;'><input type='checkbox' id='apTimeline' ${state.timeline?'checked':''}> 热度轨迹</label><label style='font-size:12px;display:flex;align-items:center;gap:4px;'><input type='checkbox' id='apInfo' ${window.ede.showDanmakuInfo?'checked':''}> 信息栏</label></div>
        <div class='note'>数值实时显示；速度越大滚动越快。</div></div></div>`;
      const bindSlider=(id,cb)=>{ const el=sec.querySelector('#'+id); const num=sec.querySelector('#'+id+'Num'); const paint=(r)=>{ paintRangeInput(r); if(num) num.textContent=r.value; }; paint(el); el.addEventListener('input',e=>{ cb(e.target.value); paint(e.target); }); };
      bindSlider('apFont',v=>{ localStorage.setItem('danmakuFontSize', v); if(window.ede.danmaku) reloadDanmaku('reload'); });
      bindSlider('apOpacity',v=>{ localStorage.setItem('danmakuTransparencyLevel', v); globalOpacity=v/100; });
  bindSlider('apSpeed',v=>{ localStorage.setItem('danmakuSpeed', v); if(window.ede.danmaku) window.ede.danmaku.speed=parseInt(v); });
  bindSlider('apTimelineOp',v=>{ localStorage.setItem('edeTimelineOpacity', v); const val=(v/100).toFixed(2); document.documentElement.style.setProperty('--ede-pbp-unplayed-op', val); });
      sec.querySelector('#apTimeline').onchange=e=>{ localStorage.setItem('danmakuTimelineEnabled', e.target.checked); renderDanmakuTimeline(); };
      sec.querySelector('#apInfo').onchange=e=>{ window.ede.showDanmakuInfo=e.target.checked; localStorage.setItem('showDanmakuInfo', e.target.checked); const info=document.querySelector('#videoOsdDanmakuTitle'); if(info) info.style.display=e.target.checked?'block':'none'; const btn=document.querySelector('#switchDanmakuInfo .md-icon'); if(btn) btn.innerText= info_switch_icons[e.target.checked?1:0]; };
  const resetBtn=sec.querySelector('#apReset'); if(resetBtn){ resetBtn.onclick=()=>{ const defF=isMobile?fontSizeMobile:fontSizeDesktop; const defaults={apFont:defF,apOpacity:100,apSpeed:200,apTimelineOp:85}; Object.entries(defaults).forEach(([id,val])=>{ const el=sec.querySelector('#'+id); if(!el) return; el.value=val; el.dispatchEvent(new Event('input')); }); sec.querySelector('#apTimeline').checked=true; sec.querySelector('#apTimeline').dispatchEvent(new Event('change')); }; }
    }
  // (去重) 保留前一个 buildAppearance 版本，删除重复定义

    function buildFilter(){ secBuilt.filter=true; const sec=qs('#sec-filter'); // 关键词 chips
      const words=window.ede.filterWords||[]; const typeSelected = localStorage.getItem('danmakuTypeFilter')? JSON.parse(localStorage.getItem('danmakuTypeFilter')):[];
      const curLevel = parseInt(localStorage.getItem('danmakuFilterLevel')||'0');
      sec.innerHTML=`<div class='dc-grid'>
        <div class='dc-card'>
          <h4 style="display:flex;align-items:center;justify-content:space-between;gap:8px;">等级
            <button id='fltToggle' class='mini-btn' title='启用/关闭过滤'>${curLevel>0?'关闭':'开启'}</button>
          </h4>
          <div class='range-line'><span id='fltLevelLabel'>级别:${curLevel}</span><input type='range' id='fltLevel' min='0' max='4' step='1' value='${curLevel}'></div>
          <div class='note'>0关闭 4最强，可用按钮一键${curLevel>0?'关闭':'恢复'}。</div>
        </div>
        <div class='dc-card'>
          <h4>类型</h4>
          <div id='fltTypes' class='chip-wrap'></div>
          <div class='note'>选择要过滤掉的类型。</div>
        </div>
        <div class='dc-card'>
          <h4 style='display:flex;align-items:center;justify-content:space-between;'>关键词 <span style='font-size:11px;opacity:.6;'>${words.length} 条</span></h4>
          <div class='kw-input-row'>
            <input id='fltWordInput' class='kw-input' placeholder='输入关键词 后回车'>
            <button id='fltAdd' class='icon-btn' title='添加'><span class='md-icon'>add</span></button>
          </div>
          <div id='fltWordList' class='chips-area'></div>
          <div class='note'>命中即过滤，不区分大小写。点击 × 删除。</div>
        </div>
      </div>`;
      // 注入一次样式
      if(!document.getElementById('ede-filter-style')){
        const st=document.createElement('style'); st.id='ede-filter-style'; st.textContent=`
        .kw-input-row{display:flex;gap:6px;align-items:center;background:rgba(255,255,255,.07);padding:4px 8px;border-radius:8px;}
        .kw-input{flex:1;background:transparent;border:0;color:#fff;font:inherit;padding:4px 2px;outline:none;min-width:60px;}
        .icon-btn,.mini-btn{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:4px 10px;font-size:12px;transition:.18s;}
        .icon-btn:hover,.mini-btn:hover{background:rgba(255,255,255,.22);} .icon-btn:active,.mini-btn:active{transform:scale(.9);} .icon-btn .md-icon{font-size:18px;}
        .chips-area{display:flex;flex-wrap:wrap;gap:6px;max-height:140px;overflow:auto;margin-top:6px;}
        .chip{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:#00a4dc33;color:#00d2ff;font-size:12px;border-radius:16px;line-height:1;}
        .chip button{background:transparent;border:0;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;}
        .chip button:hover{color:#fff;}
        .chip-wrap{display:flex;flex-wrap:wrap;gap:6px;}
        .chip-wrap label{background:rgba(255,255,255,.08);padding:4px 10px;border-radius:16px;font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;}
        .chip-wrap label:hover{background:rgba(255,255,255,.14);} .chip-wrap input{margin:0;}
        `; document.head.appendChild(st);
      }
  const flR=sec.querySelector('#fltLevel'); paintRangeInput(flR); const label=sec.querySelector('#fltLevelLabel'); const updateLevel=()=>{ label.textContent='级别:'+flR.value; localStorage.setItem('danmakuFilterLevel', flR.value); onFilterConfigChanged(); paintRangeInput(flR); const tb=document.querySelector('#filteringDanmaku .md-icon'); if(tb){ const lv=parseInt(localStorage.getItem('danmakuFilterLevel')||0); tb.innerText=filter_icons[lv]; } }; flR.oninput=debounce(updateLevel,120);
      // Toggle 按钮
  const toggleBtn=sec.querySelector('#fltToggle'); if(toggleBtn){ toggleBtn.onclick=()=>{ const v=parseInt(localStorage.getItem('danmakuFilterLevel')||'0'); if(v>0){ localStorage.setItem('danmakuLastFilterLevel', v); localStorage.setItem('danmakuFilterLevel', 0); flR.value=0; } else { const last=parseInt(localStorage.getItem('danmakuLastFilterLevel')||'2')||2; flR.value= last; localStorage.setItem('danmakuFilterLevel', last); } updateLevel(); toggleBtn.textContent = (parseInt(localStorage.getItem('danmakuFilterLevel')||'0')>0)?'关闭':'开启'; const tb=document.querySelector('#filteringDanmaku .md-icon'); if(tb){ const lv=parseInt(localStorage.getItem('danmakuFilterLevel')||0); tb.innerText=filter_icons[lv]; } } }
      // 类型
      const typeWrap=sec.querySelector('#fltTypes'); Object.values(danmakuTypeFilterOpts).forEach(opt=>{ const chip=document.createElement('label'); chip.innerHTML=`<input type='checkbox' ${typeSelected.includes(opt.id)?'checked':''} data-val='${opt.id}'>${opt.name}`; chip.querySelector('input').onchange=e=>{ let arr= localStorage.getItem('danmakuTypeFilter')? JSON.parse(localStorage.getItem('danmakuTypeFilter')):[]; if(e.target.checked && !arr.includes(opt.id)) arr.push(opt.id); else if(!e.target.checked) arr=arr.filter(x=>x!==opt.id); localStorage.setItem('danmakuTypeFilter', JSON.stringify(arr)); onFilterConfigChanged(); }; typeWrap.appendChild(chip); });
      // 关键词
      const listEl=sec.querySelector('#fltWordList'); function renderWords(){ listEl.innerHTML=''; (window.ede.filterWords||[]).forEach(w=>{ const chip=document.createElement('div'); chip.className='chip'; chip.innerHTML=`<span>${w}</span><button data-del='${w}' title='删除'>×</button>`; chip.querySelector('button').onclick=()=>{ window.ede.filterWords=window.ede.filterWords.filter(x=>x!==w); localStorage.setItem('danmakuFilterWords', JSON.stringify(window.ede.filterWords)); compileFilterResources(); onFilterConfigChanged(); renderWords(); }; listEl.appendChild(chip); }); }
      renderWords(); const addWord=()=>{ const inp=sec.querySelector('#fltWordInput'); const v=inp.value.trim(); if(v && !(window.ede.filterWords||[]).includes(v)){ window.ede.filterWords.push(v); localStorage.setItem('danmakuFilterWords', JSON.stringify(window.ede.filterWords)); compileFilterResources(); onFilterConfigChanged(); renderWords(); inp.value=''; } };
      sec.querySelector('#fltAdd').onclick=addWord; sec.querySelector('#fltWordInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); addWord(); } });
    }

    function buildFunctions(){ secBuilt.functions=true; const sec=qs('#sec-functions'); sec.innerHTML=`<div class='dc-grid'><div class='dc-card'><h4>快速</h4><div class='feature-list'><div class='feat-btn' id='fnSearch'>搜索</div><div class='feat-btn' id='fnHeatmap'>热度图</div><div class='feat-btn' id='fnLog'>日志</div><div class='feat-btn' id='fnReload'>重载</div></div><div class='note'>集中常用工具。</div></div><div class='dc-card'><h4>弹幕</h4><div class='feature-list'><div class='feat-btn' id='fnInfo'>信息栏 ${window.ede.showDanmakuInfo?'关':'开'}</div><div class='feat-btn' id='fnSwitch'>显示/隐藏</div></div><div class='note'>快速开关。</div></div></div>`; const bind=(id,fn)=>sec.querySelector(id).onclick=fn; bind('#fnSearch',showSearchDialog); bind('#fnHeatmap',showHeatmapDialog); bind('#fnLog',showLogDialog); bind('#fnReload',()=>reloadDanmaku('reload',true)); bind('#fnInfo',()=>{ window.ede.showDanmakuInfo=!window.ede.showDanmakuInfo; localStorage.setItem('showDanmakuInfo', window.ede.showDanmakuInfo); const infoBtn=sec.querySelector('#fnInfo'); if(infoBtn) infoBtn.textContent='信息栏 '+(window.ede.showDanmakuInfo?'关':'开'); const info=document.querySelector('#videoOsdDanmakuTitle'); if(info) info.style.display=window.ede.showDanmakuInfo?'block':'none'; const btn=document.querySelector('#switchDanmakuInfo .md-icon'); if(btn) btn.innerText= info_switch_icons[window.ede.showDanmakuInfo?1:0]; }); bind('#fnSwitch',()=>{ document.getElementById('displayDanmaku')?.click(); }); }

    function buildLayout(){
      secBuilt.layout=true;
      const sec=qs('#sec-layout');
      const list=Object.entries(featureMap).map(([id,label])=>`<label class='ext-item'><input type='checkbox' data-ext='${id}' ${(state.external.includes(id)?'checked':'')}>${label}</label>`).join('');
      // 简易排序列表 (不含 display / center)
      const orderItems = window.ede.buttonOrder.filter(id=>id!=='displayDanmaku'&&id!=='danmakuCenter').map(id=>`<div class='bo-item' draggable='true' data-id='${id}'><span class='md-icon'>drag_indicator</span><span class='bo-label'>${featureMap[id]||id}</span></div>`).join('');
      sec.innerHTML=`<div class='dc-grid'>
        <div class='dc-card'>
          <h4>外显按钮</h4>
          <div class='ext-grid' id='extList'>${list}</div>
          <div class='note'>选中的功能会直接显示在顶部条（始终保留: 开关 / 中心）。</div>
        </div>
        <div class='dc-card'>
          <h4 style='display:flex;align-items:center;justify-content:space-between;'>排序 <button id='boReset' class='mini-btn' style='padding:4px 10px;'>默认</button></h4>
          <div id='boList' class='bo-list' style='display:flex;flex-direction:column;gap:6px;'>${orderItems}</div>
          <div class='note'>拖拽调整顺序；即时生效。</div>
        </div>
        <div class='dc-card'>
          <h4>布局选项</h4>
          <label style='display:flex;align-items:center;gap:6px;font-size:12px;'><input type='checkbox' id='loCompact' ${state.compact?'checked':''}>紧凑模式</label>
          <div class='note'>紧凑模式仅保留开关+中心。</div>
        </div>
      </div>`;
      if(!document.getElementById('ede-layout-style')){
        const st=document.createElement('style'); st.id='ede-layout-style'; st.textContent=`#sec-layout .bo-item{display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;cursor:move;font-size:12px;}#sec-layout .bo-item.dragging{opacity:.5}#sec-layout .bo-item.over{outline:2px dashed #00a4dc;}#sec-layout .bo-item .md-icon{font-size:18px;opacity:.7}`; document.head.appendChild(st);
      }
      // 复选控制
      sec.querySelectorAll('[data-ext]').forEach(inp=>{ inp.onchange=e=>{ const id=e.target.getAttribute('data-ext'); if(e.target.checked && !state.external.includes(id)) state.external.push(id); else if(!e.target.checked) state.external=state.external.filter(x=>x!==id); localStorage.setItem('danmakuExternalButtons', JSON.stringify(state.external)); window.ede.externalButtons=[...state.external]; const bar=document.getElementById('danmakuCtr'); if(bar){ bar.remove(); setTimeout(()=>initUI(),0); } }; });
      // 拖拽排序
      const boList=sec.querySelector('#boList'); let dragEl=null; boList.querySelectorAll('.bo-item').forEach(item=>{ item.addEventListener('dragstart',e=>{ dragEl=item; item.classList.add('dragging'); }); item.addEventListener('dragend',()=>{ dragEl && dragEl.classList.remove('dragging'); boList.querySelectorAll('.bo-item').forEach(i=>i.classList.remove('over')); dragEl=null; }); item.addEventListener('dragover',e=>{ e.preventDefault(); if(item===dragEl) return; item.classList.add('over'); }); item.addEventListener('dragleave',()=>item.classList.remove('over')); item.addEventListener('drop',e=>{ e.preventDefault(); if(item===dragEl) return; const children=[...boList.children]; const from=children.indexOf(dragEl); const to=children.indexOf(item); if(from<0||to<0) return; if(from<to) boList.insertBefore(dragEl, item.nextSibling); else boList.insertBefore(dragEl, item); boList.querySelectorAll('.bo-item').forEach(i=>i.classList.remove('over')); // 更新顺序
        const newOrder=['displayDanmaku', ...[...boList.children].map(c=>c.getAttribute('data-id')), 'danmakuCenter']; window.ede.buttonOrder=newOrder; localStorage.setItem('danmakuButtonOrder', JSON.stringify(newOrder)); const ctr=document.getElementById('danmakuCtr'); if(ctr){ ctr.remove(); initUI(); } showTooltip('顺序已更新'); }); });
      // 重置
      sec.querySelector('#boReset').onclick=()=>{ const def=['displayDanmaku','filteringDanmaku','danmakuSettings','switchDanmakuInfo','searchDanmaku','showDanmakuLog','danmakuHeatmap','danmakuCenter']; window.ede.buttonOrder=def; localStorage.setItem('danmakuButtonOrder', JSON.stringify(def)); buildLayout(); const ctr=document.getElementById('danmakuCtr'); if(ctr){ ctr.remove(); initUI(); } showTooltip('已恢复默认顺序'); };
      // 紧凑模式
      sec.querySelector('#loCompact').onchange=e=>{ state.compact=e.target.checked; window.ede.compactUI=state.compact; localStorage.setItem('danmakuCompactUI', state.compact); const bar=document.getElementById('danmakuCtr'); if(bar){ bar.remove(); setTimeout(()=>initUI(),0); } };
    }

    function buildAdvanced(){ secBuilt.advanced=true; const sec=qs('#sec-advanced'); sec.innerHTML=`<div class='dc-grid'><div class='dc-card'><h4>中文转换</h4><div style='display:flex;flex-direction:column;gap:6px;font-size:12px;'>${[0,1,2].map(v=>`<label style='display:flex;align-items:center;gap:6px;'><input type='radio' name='advCh' value='${v}' ${state.chConvert==v?'checked':''}>${['不转换','转简体','转繁体'][v]}</label>`).join('')}</div></div><div class='dc-card'><h4>缓存与代理</h4><label style='display:flex;align-items:center;gap:6px;font-size:12px;'><input type='checkbox' id='advCache' ${window.ede.cacheEnabled?'checked':''}>启用缓存</label><div class='note'>缓存搜索与弹幕 1h/24h 有效。</div><div style='margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:12px;'><div style='display:flex;gap:6px;align-items:center;background:rgba(255,255,255,.07);padding:4px 8px;border-radius:8px;'><span class='prefix' style='opacity:.6;font-size:12px;'>URL</span><input id='advProxy' placeholder='自定义代理 https://...' value='${window.ede.customProxyServer||''}' style='flex:1;background:transparent;border:0;color:#fff;outline:none;font:inherit;'><button id='advProxyClear' class='icon-btn' title='清除'><span class='md-icon'>close</span></button></div></div></div></div>`; sec.querySelectorAll('input[name=advCh]').forEach(r=> r.onchange=e=>{ if(e.target.checked){ localStorage.setItem('chConvert', e.target.value); window.ede.chConvert=parseInt(e.target.value); reloadDanmaku('reload'); }}); sec.querySelector('#advCache').onchange=e=>{ window.ede.cacheEnabled=e.target.checked; localStorage.setItem('danmakuCacheEnabled', e.target.checked); }; const pr=sec.querySelector('#advProxy'); let t; pr.oninput=()=>{ clearTimeout(t); t=setTimeout(()=>{ const v=pr.value.trim(); window.ede.customProxyServer=v; if(v) localStorage.setItem('danmakuCustomProxy', v); else localStorage.removeItem('danmakuCustomProxy'); },800); }; sec.querySelector('#advProxyClear').onclick=()=>{ pr.value=''; pr.dispatchEvent(new Event('input')); showTooltip('已清除自定义代理'); } }

  // (已前置定义的 showQuickAppearanceDialog 这里移除重复)

    // 事件 & 初始显示
    dialog.querySelector('#dcReload').onclick=()=>reloadDanmaku('reload',true);
    dialog.querySelector('#dcClose').onclick=()=>dialog.remove();
  switchSection(initialSection || 'overview');
  }

  // (legacy filterSettings dialog 已彻底移除)

  function updateButtonOrderList(container){ container.innerHTML=''; const buttonConfigs={ displayDanmaku:'弹幕开关', filteringDanmaku:'过滤等级', danmakuSettings:'弹幕设置', switchDanmakuInfo:'信息显示', searchDanmaku:'搜索弹幕', showDanmakuLog:'调试日志', danmakuHeatmap:'热度图', danmakuCenter:'弹幕中心' }; const resetButton=document.createElement('button'); resetButton.className='reset-order-button paper-icon-button-light'; resetButton.innerHTML=`<span class="md-icon">${reset_icon}</span> <span>还原默认顺序</span>`; resetButton.onclick= async ()=>{ const def=['displayDanmaku','filteringDanmaku','danmakuSettings','switchDanmakuInfo','searchDanmaku','showDanmakuLog']; window.ede.buttonOrder=def; localStorage.setItem('danmakuButtonOrder', JSON.stringify(def)); updateButtonOrderList(container); await new Promise(r=>setTimeout(r,0)); const ctr=document.getElementById('danmakuCtr'); if(ctr){ ctr.remove(); await new Promise(r=>setTimeout(r,0)); initUI(); } showTooltip('已还原默认按钮顺序'); }; container.appendChild(resetButton); const list=document.createElement('div'); list.className='button-order-list'; container.appendChild(list); window.ede.buttonOrder.forEach((id,index)=>{ if(!buttonConfigs[id]) return; const item=document.createElement('div'); item.className='button-order-item'; item.setAttribute('draggable','true'); item.setAttribute('data-button-id', id); item.setAttribute('data-index', index); item.innerHTML=`<div class="button-order-content"><span class="md-icon handle">drag_indicator</span><span class="button-name">${buttonConfigs[id]}</span><span class="order-number">#${index+1}</span></div>`; item.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain', index); item.classList.add('dragging'); }); item.addEventListener('dragover',e=>{ e.preventDefault(); const dragging=document.querySelector('.dragging'); if(dragging!==item) item.classList.add('drag-over'); }); item.addEventListener('dragleave',()=> item.classList.remove('drag-over')); item.addEventListener('drop',e=>{ e.preventDefault(); item.classList.remove('drag-over'); const from=parseInt(e.dataTransfer.getData('text/plain')); const to=index; if(from===to) return; const newOrder=[...window.ede.buttonOrder]; const [moved]=newOrder.splice(from,1); newOrder.splice(to,0,moved); window.ede.buttonOrder=newOrder; localStorage.setItem('danmakuButtonOrder', JSON.stringify(newOrder)); updateButtonOrderList(container); const ctr=document.getElementById('danmakuCtr'); if(ctr){ ctr.remove(); initUI(); } showTooltip('按钮顺序已更新'); }); item.addEventListener('dragend',()=>{ item.classList.remove('dragging'); document.querySelectorAll('.button-order-item').forEach(n=>n.classList.remove('drag-over')); }); list.appendChild(item); }); if(!document.querySelector('#button-order-styles')){ const style=document.createElement('style'); style.id='button-order-styles'; style.textContent=`.button-order-list{display:flex;flex-direction:column;gap:8px}.button-order-item{background:rgba(255,255,255,0.1);border-radius:6px;transition:.2s}.button-order-content{display:flex;align-items:center;padding:12px;gap:12px;cursor:move}.button-order-item .handle{opacity:.7}.button-order-item .button-name{flex:1}.button-order-item .order-number{opacity:.5}.button-order-item.dragging{opacity:.5;background:rgba(0,164,220,0.2)}.button-order-item.drag-over{transform:translateY(2px);box-shadow:0 -2px 0 #00a4dc}.button-order-item:hover{background:rgba(255,255,255,0.15)}.reset-order-button{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-bottom:12px;padding:8px;background:rgba(0,164,220,0.1);color:#00a4dc;border:none;border-radius:6px;cursor:pointer}.reset-order-button:hover{background:rgba(0,164,220,0.2);transform:translateY(-1px)}.reset-order-button .md-icon{font-size:18px}`; document.head.appendChild(style); } }

  // ===== 实时弹幕密度图（嵌入进度条上方） =====
  function buildDanmakuDensityData(){ try { const list=window.ede.filteredComments||window.ede.parsedComments; if(!list||!list.length){ window.ede._densityData=null; return; } const lastTime=list[list.length-1].time||0; const duration = Math.max(lastTime, getActiveVideo()?.duration||0); const bucketSize = 1; const bucketCount=Math.ceil(duration/bucketSize)+1; const buckets=new Array(bucketCount).fill(0); for(const c of list){ const idx=(c.time/bucketSize)|0; if(idx>=0 && idx<bucketCount) buckets[idx]++; } const max=buckets.reduce((a,b)=>b>a?b:a,0)||1; window.ede._densityData={ buckets,max,bucketSize,duration }; } catch(e){ console.warn('密度数据失败',e); window.ede._densityData=null; } }
  function getProgressSlider(){ return document.querySelector(`${mediaContainerQueryStr} .videoOsdPositionSliderContainer`)||document.querySelector('.videoOsdPositionSliderContainer'); }
  function ensureDensityOverlay(){ const host=getProgressSlider(); if(!host) return null; if(!host.classList.contains('ede-density-host')){ host.classList.add('ede-density-host'); host.style.position='relative'; }
    let wrap=host.querySelector('.ede-density-wrap'); if(!wrap){ wrap=document.createElement('div'); wrap.className='ede-density-wrap'; // 再提高高度 (原 38px -> 46px -> 52px)
      wrap.style.cssText='position:absolute;left:0;right:0;bottom:100%;height:52px;padding:0 0 8px;pointer-events:none;'; host.appendChild(wrap); }
  if(!document.getElementById('ede-density-style')){ const st=document.createElement('style'); st.id='ede-density-style'; st.textContent=`:root{--ede-pbp-unplayed-op:0.22;--ede-pbp-blue-op:0.55;--ede-pbp-color:#00a1d6;} .ede-density-wrap svg{width:100%;height:100%;display:block;} .ede-density-wrap .ede-pbp-base{fill:#ffffff;opacity:var(--ede-pbp-unplayed-op,0.22);} .ede-density-wrap .ede-pbp-blue,.ede-density-wrap .ede-pbp-blue-seg{fill:var(--ede-pbp-color,#00a1d6);opacity:var(--ede-pbp-blue-op,0.55);} .ede-density-wrap .ede-pbp-line{stroke:rgba(255,255,255,0.55);stroke-width:1;shape-rendering:crispEdges;} .ede-density-wrap .tip{position:absolute;bottom:100%;background:rgba(0,0,0,.78);color:#fff;font-size:11px;padding:4px 6px;border-radius:4px;white-space:nowrap;transform:translate(-50%, -6px);pointer-events:none;backdrop-filter:blur(4px);} .ede-reset-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;border:1px solid #425166;background:rgba(255,255,255,0.03);color:#cfd7df;font-weight:500;cursor:pointer;backdrop-filter:blur(4px);transition:color .25s,background .25s,border-color .25s,transform .25s;} .ede-reset-btn:hover{background:rgba(255,255,255,0.06);border-color:#56697d;color:#fff;} .ede-reset-btn:active{transform:scale(.92);} .ede-reset-btn .md-icon{transform:rotate(0deg);transition:transform .5s cubic-bezier(.4,.1,.2,1);opacity:.85;} .ede-reset-btn:hover .md-icon{transform:rotate(-180deg);opacity:1;} `; document.head.appendChild(st); }
    return wrap;
  }
  function simplifyBuckets(buckets,maxPoints){ if(buckets.length<=maxPoints) return buckets.map((v,i)=>[i,v]); const step=buckets.length/maxPoints; const out=[]; for(let i=0;i<maxPoints;i++){ const start=Math.floor(i*step); const end=Math.floor((i+1)*step); let sum=0,c=0; for(let j=start;j<end;j++){ sum+=buckets[j]; c++; } out.push([Math.floor((start+end)/2), c?sum/c:0]); } return out; }
  function buildCurvePath(samples,height,maxVal){ if(samples.length===0) return ''; const pts=samples.map(([x,v])=>[x, height - (v/maxVal)* (height-4) -2 ]); // y
    // Catmull-Rom to Bezier
    let d=`M0 ${height} L ${pts[0][0]} ${pts[0][1]}`; for(let i=0;i<pts.length-1;i++){ const p0=pts[i-1]||pts[i]; const p1=pts[i]; const p2=pts[i+1]; const p3=pts[i+2]||p2; const cp1x=p1[0]+(p2[0]-p0[0])/6; const cp1y=p1[1]+(p2[1]-p0[1])/6; const cp2x=p2[0]-(p3[0]-p1[0])/6; const cp2y=p2[1]-(p3[1]-p1[1])/6; d+=` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`; }
    const lastX=samples[samples.length-1][0]; d+=` L ${lastX} ${height} Z`; return d; }
  function renderDanmakuTimeline(resizeOnly){ const data=window.ede._densityData; const wrap=ensureDensityOverlay(); if(!wrap) return; if(!data){ wrap.innerHTML=''; return; } const { buckets,max,duration }=data; const height=120; // viewBox height (再提高)
  if(localStorage.getItem('danmakuTimelineEnabled')==='false'){ wrap.style.display='none'; return; } else { wrap.style.display='block'; }
    const simplified=simplifyBuckets(buckets,180); const scaleX= (x)=> (x/(buckets.length-1))*1000; const scaled = simplified.map(([i,v])=>[scaleX(i), v]); const path=buildCurvePath(scaled,height,max); const video=getActiveVideo(); const progressRatio= video && duration? (video.currentTime/duration):0; const progressX = progressRatio*1000;
    wrap.innerHTML=`<svg viewBox='0 0 1000 ${height}' preserveAspectRatio='none'>
      <defs>
        <clipPath id='ede-pbp-curve-path' clipPathUnits='userSpaceOnUse'>
          <path d="${path}"></path>
        </clipPath>
      </defs>
      <g clip-path='url(#ede-pbp-curve-path)'>
        <rect class='ede-pbp-base' x='0' y='0' width='1000' height='${height}'></rect>
        <g class='ede-pbp-blue-group'></g>
        <line class='ede-pbp-line' x1='${progressX}' x2='${progressX}' y1='0' y2='${height}'></line>
      </g>
    </svg>`;
    // 初始化观看段数据结构
    if(!window.ede._watchedSegments){ window.ede._watchedSegments=[]; window.ede._lastSegmentUpdateTime=0; }
    drawWatchedSegments();
    if(resizeOnly) return;
    setupCurveHover(wrap, duration, buckets, height, path);
  }
  // 绘制已观看段（支持跳跃空白）
  function drawWatchedSegments(force){ const wrap=document.querySelector('.ede-density-wrap'); if(!wrap) return; const group=wrap.querySelector('.ede-pbp-blue-group'); if(!group) return; const data=window.ede._densityData; const video=getActiveVideo(); if(!data||!video) return; const {duration}=data; const W=1000; const svg=wrap.querySelector('svg'); if(!svg) return; const vh=svg.viewBox.baseVal.height;
    if(force){ group.innerHTML=''; for(const seg of (window.ede._watchedSegments||[])){ const s=Math.max(0, Math.min(seg.start, duration)); const e=Math.max(s, Math.min(seg.end, duration)); if(e<=s) continue; const x=(s/duration)*W; const w=((e-s)/duration)*W; const rect=document.createElementNS('http://www.w3.org/2000/svg','rect'); rect.setAttribute('class','ede-pbp-blue-seg'); rect.setAttribute('x', x); rect.setAttribute('y', 0); rect.setAttribute('width', w); rect.setAttribute('height', vh); group.appendChild(rect); seg._el=rect; } return; }
    // 增量：只处理最后一段
    const segs=window.ede._watchedSegments||[]; if(!segs.length) return; const last=segs[segs.length-1]; if(!last._el){ // 创建
      const s=Math.max(0, Math.min(last.start, duration)); const e=Math.max(s, Math.min(last.end, duration)); if(e<=s) return; const rect=document.createElementNS('http://www.w3.org/2000/svg','rect'); rect.setAttribute('class','ede-pbp-blue-seg'); rect.setAttribute('y',0); rect.setAttribute('height',vh); group.appendChild(rect); last._el=rect; }
    const s=Math.max(0, Math.min(last.start, duration)); const e=Math.max(s, Math.min(last.end, duration)); if(e<=s) return; const x=(s/duration)*W; const w=((e-s)/duration)*W; last._el.setAttribute('x', x); last._el.setAttribute('width', w);
  }
  // 维护观看进度段（精简+动态阈值）
  function updateWatchedSegments(force){ const video=getActiveVideo(); const data=window.ede._densityData; if(!video||!data||!video.duration) return; const t=video.currentTime; const segs=window.ede._watchedSegments||[]; const pr=video.playbackRate||1; const dynamicGap=Math.min(3, Math.max(0.8, 0.5*pr + 0.4));
    if(!segs.length){ segs.push({start:0,end:t}); window.ede._watchedSegments=segs; drawWatchedSegments(true); return; }
    const last=segs[segs.length-1];
    const forwardGap=t-last.end; // 仅关心前进
    if(forwardGap > dynamicGap){ segs.push({start:t,end:t}); drawWatchedSegments(true); return; }
    if(t>last.end){ last.end=t; if(force || t - (window.ede._lastSegmentUpdateTime||0) > 0.25){ drawWatchedSegments(false); window.ede._lastSegmentUpdateTime=t; } }
  }
  function setupCurveHover(wrap,duration,buckets,height,path){ if(wrap._curveHoverBound) return; wrap._curveHoverBound=true; let tip=document.createElement('div'); tip.className='tip'; tip.style.display='none'; wrap.appendChild(tip); const svg=wrap.querySelector('svg'); const video=getActiveVideo(); svg.addEventListener('mousemove',e=>{ const rect=svg.getBoundingClientRect(); const x=Math.min(Math.max(e.clientX-rect.left,0),rect.width); const ratio=x/rect.width; const t=ratio*duration; const idx=Math.min(buckets.length-1, Math.max(0, Math.floor(ratio*buckets.length))); const count=buckets[idx]; tip.style.display='block'; tip.style.left=x+'px'; tip.innerHTML=`${formatTime(t)}<br>${count}条`; }); svg.addEventListener('mouseleave',()=>{ tip.style.display='none'; }); svg.addEventListener('click',e=>{ const rect=svg.getBoundingClientRect(); const x=Math.min(Math.max(e.clientX-rect.left,0),rect.width); const ratio=x/rect.width; if(video){ video.currentTime=ratio*duration; updateTimelineCursor(); } }); }
  function updateTimelineCursor(){ const wrap=document.querySelector('.ede-density-wrap'); if(!wrap) return; const data=window.ede._densityData; if(!data) return; const video=getActiveVideo(); if(!video||!video.duration) return; const svg=wrap.querySelector('svg'); if(!svg) return; const duration=data.duration; const progressRatio=video.currentTime/duration; const progressX=progressRatio*1000; const line=svg.querySelector('.ede-pbp-line'); if(line){ line.setAttribute('x1',progressX); line.setAttribute('x2',progressX); } const blue=svg.querySelector('.ede-pbp-blue'); if(blue){ blue.setAttribute('width',progressX); }
    updateWatchedSegments();
  }
  function attachTimelineMediaEvents(){ const video=getActiveVideo(); if(!video||video._densityBound) return; video._densityBound=true; // 节流 timeupdate
    const baseInterval=0.08; let last=0; let scheduled=false; function flush(){ scheduled=false; updateTimelineCursor(); }
    video.addEventListener('timeupdate', ()=>{ const t=video.currentTime; const pr=Math.max(1, video.playbackRate||1); const interval=baseInterval/Math.min(pr,2); if(t-last>=interval){ last=t; updateTimelineCursor(); } else if(!scheduled){ scheduled=true; setTimeout(flush, (interval-(t-last))*1000); } });
    video.addEventListener('seeked', ()=>{ updateWatchedSegments(true); last=0; updateTimelineCursor(); }); }
  // 追加暂停平滑处理：动态系数缓冲高倍速恢复跳跃 (使用统一 nowSec)
  (function enhancePauseSmooth(){ const video=getActiveVideo(); if(!video) return; if(video._edePauseSmoothBound) return; video._edePauseSmoothBound=true; video.addEventListener('pause', ()=>{ window.ede._pauseWallClock = nowSec(); }); video.addEventListener('play', ()=>{ if(!window.ede.danmaku) return; if(!window.ede._pauseWallClock) return; const delta = nowSec() - window.ede._pauseWallClock; const pr=Math.max(1, video.playbackRate||1); const factor = Math.min(0.9, 0.32 + (pr-1)*0.28); const smoothDelay = Math.min(0.8, delta * factor); try { const rl = window.ede.danmaku._ && window.ede.danmaku._.runningList; if(Array.isArray(rl)) rl.forEach(c=>{ if(c && typeof c._utc==='number') c._utc += smoothDelay; }); } catch(e){} window.ede._pauseWallClock = 0; }); })();
  function formatTime(sec){ sec=Math.max(sec,0); const h=Math.floor(sec/3600); const m=Math.floor((sec%3600)/60); const s=Math.floor(sec%60); return (h>0? h.toString().padStart(2,'0')+':':'')+m.toString().padStart(2,'0')+':'+s.toString().padStart(2,'0'); }

  // ====== 独立弹幕热度图对话框 (柱状+平滑折线) ======
  function showHeatmapDialog(){
    if(!window.ede.parsedComments || !window.ede.parsedComments.length){ showTooltip('暂无弹幕数据'); return; }
    const video=getActiveVideo(); const duration= video && video.duration ? video.duration : (window.ede.parsedComments[window.ede.parsedComments.length-1].time+1);
    const bucketCount = 120;
    const bucket = new Array(bucketCount).fill(0);
    for(const c of window.ede.parsedComments){ const idx=Math.min(bucketCount-1, Math.floor(c.time/duration*bucketCount)); bucket[idx]++; }
    const smooth = bucket.map((v,i)=>{ const a=bucket[i-1]||v; const b=bucket[i+1]||v; return (a+v+b)/3; });
    const maxVal=Math.max(...bucket,1); const maxSmooth=Math.max(...smooth,1);
    const dialog=document.createElement('dialog'); dialog.setAttribute('data-heatmap-dialog','1'); dialog.style='border:0;width:70%;max-width:900px;background:transparent;padding:0;';
    dialog.innerHTML=`<div style="display:flex;flex-direction:column;padding:1.5em;background:rgba(31,31,31,0.95);color:#fff;border-radius:16px;backdrop-filter:blur(20px);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1em;">
        <h3 style="margin:0;font-size:1.3em;">弹幕实时热度图</h3>
        <div style="display:flex;gap:.5em;align-items:center;">
          <span id="heatmapCurrentTime" style="font-size:12px;opacity:.8;"></span>
          <button is="emby-button" id="closeHeatmapDialog" class="paper-icon-button-light" title="关闭"><span class="md-icon">close</span></button>
        </div>
      </div>
      <div style="font-size:12px;color:#aaa;margin-bottom:.8em;line-height:1.4;">显示整段视频各时间区间的弹幕密度。柱状代表原始计数，折线为平滑值。鼠标悬停可查看；点击跳转播放。</div>
  <div id="heatmapCanvasWrap" style="position:relative;width:100%;height:200px;background:rgba(255,255,255,0.05);border-radius:8px;overflow:visible;">
        <canvas id="heatmapCanvas" style="width:100%;height:100%;"></canvas>
        <div id="heatmapHoverLine" style="position:absolute;top:0;bottom:0;width:1px;background:#fff;pointer-events:none;opacity:0;"></div>
        <div id="heatmapTooltip" style="position:absolute;padding:4px 8px;font-size:12px;background:rgba(0,0,0,0.8);color:#fff;border-radius:4px;pointer-events:none;opacity:0;transform:translate(-50%,-120%);"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:.8em;font-size:12px;color:#888;">
        <span>0:00</span><span>${formatTime(duration)}</span>
      </div>
    </div>`;
  document.body.appendChild(dialog); unifyDialog(dialog,'弹幕热度图'); dialog.showModal();
    const canvas=dialog.querySelector('#heatmapCanvas'); const ctx=canvas.getContext('2d');
    function resize(){ const w=canvas.clientWidth; const h=canvas.clientHeight; canvas.width=w*devicePixelRatio; canvas.height=h*devicePixelRatio; ctx.scale(devicePixelRatio,devicePixelRatio); draw(); }
    function draw(){ const w=canvas.clientWidth; const h=canvas.clientHeight; ctx.clearRect(0,0,w,h); const barW=w/bucketCount; for(let i=0;i<bucketCount;i++){ const v=bucket[i]; const vh=v/maxVal; const x=i*barW; const bh = vh*h; ctx.fillStyle='rgba(0,164,220,0.35)'; ctx.fillRect(x, h-bh, Math.max(barW-1,1), bh); }
      ctx.lineWidth=2; ctx.strokeStyle='#00c8ff'; ctx.beginPath(); for(let i=0;i<bucketCount;i++){ const v=smooth[i]; const y=h - (v/maxSmooth)*h; const x = (i+0.5)*barW; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); } ctx.stroke();
      if(video){ const cur=video.currentTime/duration; ctx.strokeStyle='rgba(255,255,255,0.8)'; ctx.lineWidth=1; const x=cur*w; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    }
    resize(); window.addEventListener('resize', resize);
    const hoverLine=dialog.querySelector('#heatmapHoverLine'); const tip=dialog.querySelector('#heatmapTooltip'); const wrap=dialog.querySelector('#heatmapCanvasWrap');
  // 鼠标移动时显示提示；为避免被裁剪，容器允许溢出；若仍超出顶部则下移
  wrap.addEventListener('mousemove',e=>{ const rect=wrap.getBoundingClientRect(); const x=e.clientX-rect.left; const pct=x/rect.width; const idx=Math.min(bucketCount-1, Math.floor(pct*bucketCount)); const tStart=idx/bucketCount*duration; const tMid=tStart + duration/bucketCount/2; hoverLine.style.left=x+'px'; hoverLine.style.opacity=1; tip.style.left=x+'px'; tip.style.top='18px'; tip.style.opacity=1; tip.textContent=`${formatTime(tMid)}  条:${bucket[idx]}  平滑:${Math.round(smooth[idx])}`; requestAnimationFrame(()=>{ const tipRect=tip.getBoundingClientRect(); if(tipRect.top < rect.top){ tip.style.top='30px'; tip.style.transform='translate(-50%,-60%)'; } else { tip.style.transform='translate(-50%,-120%)'; } }); });
    wrap.addEventListener('mouseleave',()=>{ hoverLine.style.opacity=0; tip.style.opacity=0; });
    wrap.addEventListener('click',e=>{ const rect=wrap.getBoundingClientRect(); const x=e.clientX-rect.left; const pct=x/rect.width; const targetTime=pct*duration; if(video){ video.currentTime=targetTime; } });
    let raf; function loop(){ if(!document.body.contains(dialog)) return; draw(); const label=dialog.querySelector('#heatmapCurrentTime'); if(label && video) label.textContent=`当前: ${formatTime(video.currentTime)}`; raf=requestAnimationFrame(loop); } loop();
    dialog.querySelector('#closeHeatmapDialog').onclick=()=>{ cancelAnimationFrame(raf); window.removeEventListener('resize', resize); dialog.remove(); };
  }

  // Alt+H 快捷键 打开/关闭热度图
  window.addEventListener('keydown', e=>{ if(e.altKey && (e.key==='h' || e.key==='H')){ const existing=document.querySelector('dialog[data-heatmap-dialog="1"]'); if(existing){ existing.close && existing.close(); existing.remove(); } else { showHeatmapDialog(); } } });
  // ==== 原文件其余代码恢复完成 ====

  // MutationObserver 初始化 (阶段2)
  while(!window.require){ await new Promise(r=>setTimeout(r,200)); }
  if(!window.ede){ window.ede=new EDE(); const observer=new MutationObserver(()=>{ initUI(); initListener(); }); observer.observe(document.body,{childList:true,subtree:true}); setTimeout(()=>{ initUI(); initListener(); },300); }

  // Tooltip 单实例 (阶段2)
  function showTooltip(message, type='info'){ let tip=document.getElementById('ede-tooltip-single'); if(!tip){ tip=document.createElement('div'); tip.id='ede-tooltip-single'; tip.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);color:#fff;padding:12px 24px;border-radius:4px;z-index:10000;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.2);transition:opacity .3s ease;opacity:0;pointer-events:none;'; document.body.appendChild(tip); }
    tip.style.background = type==='error'? 'rgba(244,67,54,0.9)':'rgba(0,0,0,0.9)'; tip.textContent=message; tip.style.opacity='1'; clearTimeout(tip._timer); tip._timer=setTimeout(()=>{ tip.style.opacity='0'; },2000); }
})();
