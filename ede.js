// ==UserScript==
// @name         Emby danmaku extension
// @description  Emby弹幕插件
// @author       kumuze
// @version      1.0.15.3
// @copyright    2022, RyoLee (https://github.com/RyoLee), hibackd (https://github.com/hiback/emby-danmaku), chen3861229 (https://github.com/chen3861229/dd-danmaku) - Modified by kutongling (https://github.com/kutongling)
// @license      MIT;https://raw.githubusercontent.com/RyoLee/emby-danmaku/master/LICENSE
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @grant        none
// @match        */web/index.html
// ==/UserScript==

(async function() {
  'use strict';
  // ------ configs start------
  const check_interval = 200;
  const chConverTtitle = ['当前状态: 未启用', '当前状态: 转换为简体', '当前状态: 转换为繁体'];

  //图标常量
  // 0:当前状态关闭 1:当前状态打开
  const danmaku_icons = ['\uE7A2', '\uE0B9'];
  const search_icon = '\uE881';
  const translate_icon = '\uE927';
  const filter_icons = ['\uE3E0', '\uE3D0', '\uE3D1', '\uE3D2'];
  const transparency_icons = ['\uEBDC', '\uEBD9', '\uEBE0', '\uEBE2', '\uEBE2', '\uEBD4', '\uEBD2', '\uE1A4'];
  const info_switch_icons = ['\uE8F5', '\uE8F4']; // 关闭/显示
  const more_filter_icon = '\uE5D3'; // 更多过滤图标
  const log_icon = '\uE86D'; // 添加日志图标常量
  const settings_icon = '\uE8B8'; // 设置图标
  const reset_icon = '\uE166'; // 重置图标

  //通用参数常量
  const menubarOptions = {
    class: 'flex flex-direction-row',
  };
  const buttonOptions = {
    class: 'paper-icon-button-light',
    is: 'paper-icon-button-light',
  };
  const rangeSliderOptions = {
    class: 'emby-slider emby-slider-scalebg emby-slider-nothumb',
    is: 'emby-slider',
  };
  const sliderContainerOptions = {
    class: 'slidercontainer flex-grow emby-slider-container',
  };
  const sliderWrapperOptions = {
    class: 'videoOsdVolumeSliderWrapper flex-grow',
  };
  const sliderdivOptions = {
    class: 'videoOsdVolumeControls flex flex-direction-row align-items-center',
    style: 'position:relative;',
  };
  const sliderLabelOptions = {
    class: 'sliderLabel',
    style: 'margin-right: 1em; min-width: 100px;'
  };

  //定位标志常量
  const uiAnchorStr = '\uE034';
  const mediaContainerQueryStr = 'div[class~="view-videoosd-videoosd"]';
  const mediaQueryStr = 'video';

  //全局透明度/移动端检测flag
  var globalOpacity = 1.0;
  var isMobile = false;
  //字体大小（桌面/移动）
  const fontSizeDesktop = 25;
  const fontSizeMobile = 15;
  //移动设备检测
  if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    isMobile = true;
  }

  //各个控件差异化参数常量
  const displayButtonOpts = {
    title: '弹幕开关',
    id: 'displayDanmaku',
    innerText: null,
    onclick: () => {
      if (window.ede.loading) {
        console.log('正在加载,请稍后再试');
        return;
      }
      console.log('切换弹幕开关');
      window.ede.danmakuSwitch = (window.ede.danmakuSwitch + 1) % 2;
      window.localStorage.setItem('danmakuSwitch', window.ede.danmakuSwitch);
      document.querySelector('#displayDanmaku').children[0].innerText = danmaku_icons[window.ede.danmakuSwitch];
      if (window.ede.danmaku) {
        window.ede.danmakuSwitch == 1 ? window.ede.danmaku.show() : window.ede.danmaku.hide();
      }
    },
  };
  const searchButtonOpts = {
    title: '搜索弹幕',
    id: 'searchDanmaku',
    innerText: search_icon,
    onclick: () => {
      if (window.ede.loading) {
        console.log('正在加载,请稍后再试');
        return;
      }
      console.log('手动匹配弹幕');
      showSearchDialog();
    },
  };
  const translateButtonOpts = {
    title: null,
    id: 'translateDanmaku',
    innerText: translate_icon,
    onclick: () => {
      if (window.ede.loading) {
        console.log('正在加载,请稍后再试');
        return;
      }
      console.log('切换简繁转换');
      window.ede.chConvert = (window.ede.chConvert + 1) % 3;
      StorageManager.set('chConvert', window.ede.chConvert);
      document.querySelector('#translateDanmaku').setAttribute('title', chConverTtitle[window.ede.chConvert]);
      reloadDanmaku('reload');
      console.log(document.querySelector('#translateDanmaku').getAttribute('title'));
    },
  };
  const filterButtonOpts = {
    title: '过滤等级(立即生效)',
    id: 'filteringDanmaku',
    innerText: null,
    onclick: () => {
      console.log('切换弹幕过滤等级');
      let level = StorageManager.get('danmakuFilterLevel', 0);
      level = ((level ? parseInt(level) : 0) + 1) % 4;
      StorageManager.set('danmakuFilterLevel', level);
      document.querySelector('#filteringDanmaku').children[0].innerText = filter_icons[level];
      // 添加立即重载弹幕
      reloadDanmaku('reload');
    },
  };
  const transparencyRangeSliderOpts = {
    type: 'range',
    step: '1',
    min: '0',
    max: '100',
    value: '100',
    oninput: function() {
      StorageManager.set('danmakuTransparencyLevel', this.value);
      globalOpacity = this.value / 100;
    },
  };
  const infoSwitchButtonOpts = {
    title: '弹幕信息显示',
    id: 'switchDanmakuInfo',
    innerText: null,
    onclick: () => {
      console.log('切换弹幕信息显示');
      window.ede.showDanmakuInfo = !window.ede.showDanmakuInfo;
      window.localStorage.setItem('showDanmakuInfo', window.ede.showDanmakuInfo);
      
      // 更新按钮图标
      const button = document.querySelector('#switchDanmakuInfo');
      if (button) {
        const icon = button.querySelector('.md-icon');
        if (icon) {
          icon.innerText = info_switch_icons[window.ede.showDanmakuInfo ? 1 : 0];
        }
      }
      
      // 更新信息显示
      const infoElement = document.querySelector('#videoOsdDanmakuTitle');
      if (infoElement) {
        infoElement.style.display = window.ede.showDanmakuInfo ? 'block' : 'none';
      }
    },
  };
  const danmakuTypeFilterOpts = {
    bottom: { id: 'bottom', name: '底部弹幕', },
    top: { id: 'top', name: '顶部弹幕', },
    rolling: { id: 'rolling', name: '滚动弹幕', }, // 滚动弹幕选项包含了 ltr 和 rtl
    onlyWhite: { id: 'onlyWhite', name: '彩色弹幕', },
    emoji: { id: 'emoji', name: 'emoji', },
  };
  const moreFilterButtonOpts = {
    title: '更多过滤选项',
    id: 'moreFilteringDanmaku',
    innerText: more_filter_icon,
    onclick: () => {
        console.log('显示更多过滤选项');
        showFilterDialog();
    },
  };
  const logButtonOpts = {
    title: '显示调试日志',
    id: 'showDanmakuLog',
    innerText: log_icon,
    onclick: () => {
      showLogDialog();
    },
  };
  const settingsButtonOpts = {
    title: '弹幕设置',
    id: 'danmakuSettings',
    innerText: settings_icon,
    onclick: () => {
      showDanmakuSettingsDialog();
    },
  };

  // ------ configs end------
  /* eslint-disable */
  /* https://cdn.jsdelivr.net/npm/danmaku/dist/danmaku.canvas.min.js */
  // 替换其中"render:function(t,e){t.context.drawImage(e.canvas,e.x*n,e.y*n)}"为"render:function(t,e){t.context.globalAlpha=globalOpacity,t.context.drawImage(e.canvas,e.x*n,e.y*n)}"
  // prettier-ignore
  !function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):(t="undefined"!=typeof globalThis?globalThis:t||self).Danmaku=e()}(this,(function(){"use strict";var t=function(){for(var t=["oTransform","msTransform","mozTransform","webkitTransform","transform"],e=document.createElement("div").style,i=0;i<t.length;i++)if(t[i]in e)return t[i];return"transform"}();function e(t){var e=document.createElement("div");if(e.style.cssText="position:absolute;","function"==typeof t.render){var i=t.render();if(i instanceof HTMLElement)return e.appendChild(i),e}if(e.textContent=t.text,t.style)for(var n in t.style)e.style[n]=t.style[n];return e}var i={name:"dom",init:function(){var t=document.createElement("div");return t.style.cssText="overflow:hidden;white-space:nowrap;transform:translateZ(0);",t},clear:function(t){for(var e=t.lastChild;e;)t.removeChild(e),e=t.lastChild},resize:function(t,e,i){t.style.width=e+"px",t.style.height=i+"px"},framing:function(){},setup:function(t,i){var n=document.createDocumentFragment(),s=0,r=null;for(s=0;s<i.length;s++)(r=i[s]).node=r.node||e(r),n.appendChild(r.node);for(i.length&&t.appendChild(n),s=0;s<i.length;s++)(r=i[s]).width=r.width||r.node.offsetWidth,r.height=r.height||r.node.offsetHeight},render:function(e,i){i.node.style[t]="translate("+i.x+"px,"+i.y+"px)"},remove:function(t,e){t.removeChild(e.node),this.media||(e.node=null)}};const n=window.devicePixelRatio||1;var s=Object.create(null);function r(t,e){if("function"==typeof t.render){var i=t.render();if(i instanceof HTMLCanvasElement)return t.width=i.width,t.height=i.height,i}var r=document.createElement("canvas"),h=r.getContext("2d"),o=t.style||{};o.font=o.font||"10px sans-serif",o.textBaseline=o.textBaseline||"bottom";var a=1*o.lineWidth;for(var d in a=a>0&&a!==1/0?Math.ceil(a):1*!!o.strokeStyle,h.font=o.font,t.width=t.width||Math.max(1,Math.ceil(h.measureText(t.text).width)+2*a),t.height=t.height||Math.ceil(function(t,e){if(s[t])return s[t];var i=12,n=t.match(/(\d+(?:\.\d+)?)(px|%|em|rem)(?:\s*\/\s*(\d+(?:\.\d+)?)(px|%|em|rem)?)?/);if(n){var r=1*n[1]||10,h=n[2],o=1*n[3]||1.2,a=n[4];"%"===h&&(r*=e.container/100),"em"===h&&(r*=e.container),"rem"===h&&(r*=e.root),"px"===a&&(i=o),"%"===a&&(i=r*o/100),"em"===a&&(i=r*o),"rem"===a&&(i=e.root*o),void 0===a&&(i=r*o)}return s[t]=i,i}(o.font,e))+2*a,r.width=t.width*n,r.height=t.height*n,h.scale(n,n),o)h[d]=o[d];var u=0;switch(o.textBaseline){case"top":case"hanging":u=a;break;case"middle":u=t.height>>1;break;default:u=t.height-a}return o.strokeStyle&&h.strokeText(t.text,a,u),h.fillText(t.text,a,u),r}function h(t){return 1*window.getComputedStyle(t,null).getPropertyValue("font-size").match(/(.+)px/)[1]}var o={name:"canvas",init:function(t){var e=document.createElement("canvas");return e.context=e.getContext("2d"),e._fontSize={root:h(document.getElementsByTagName("html")[0]),container:h(t)},e},clear:function(t,e){t.context.clearRect(0,0,t.width,t.height);for(var i=0;i<e.length;i++)e[i].canvas=null},resize:function(t,e,i){t.width=e*n,t.height=i*n,t.style.width=e+"px",t.style.height=i+"px"},framing:function(t){t.context.clearRect(0,0,t.width,t.height)},setup:function(t,e){for(var i=0;i<e.length;i++){var n=e[i];n.canvas=r(n,t._fontSize)}},render:function(t,e){t.context.globalAlpha=globalOpacity,t.context.drawImage(e.canvas,e.x*n,e.y*n)},remove:function(t,e){e.canvas=null}};function a(t){var e=this,i=this.media?this.media.currentTime:Date.now()/1e3,n=this.media?this.media.playbackRate:1;function s(t,s){if("top"===s.mode||"bottom"===s.mode)return i-t.time<e._.duration;var r=(e._.width+t.width)*(i-t.time)*n/e._.duration;if(t.width>r)return!0;var h=e._.duration+t.time-i,o=e._.width+s.width,a=e.media?s.time:s._utc,d=o*(i-a)*n/e._.duration,u=e._.width-d;return h>e._.duration*u/(e._.width+s.width)}for(var r=this._.space[t.mode],h=0,o=0,a=1;a<r.length;a++){var d=r[a],u=t.height;if("top"!==t.mode&&"bottom"!==t.mode||(u+=d.height),d.range-d.height-r[h].range>=u){o=a;break}s(d,t)&&(h=a)}var m=r[h].range,c={range:m+t.height,time:this.media?t.time:t._utc,width:t.width,height:t.height};return r.splice(h+1,o-h-1,c),"bottom"===t.mode?this._.height-t.height-m%this._.height:m%(this._.height-t.height)}var d=window.requestAnimationFrame||window.mozRequestAnimationFrame||window.webkitRequestAnimationFrame||function(t){return setTimeout(t,50/3)},u=window.cancelAnimationFrame||window.mozCancelAnimationFrame||window.webkitCancelAnimationFrame||clearTimeout;function m(t,e,i){for(var n=0,s=0,r=t.length;s<r-1;)i>=t[n=s+r>>1][e]?s=n:r=n;return t[s]&&i<t[s][e]?s:r}function c(t){return/^(ltr|top|bottom)$/i.test(t)?t.toLowerCase():"rtl"}function l(){var t=9007199254740991;return[{range:0,time:-t,width:t,height:0},{range:t,time:t,width:0,height:0}]}function f(t){t.ltr=l(),t.rtl=l(),t.top=l(),t.bottom=l()}function p(){if(!this._.visible||!this._.paused)return this;if(this._.paused=!1,this.media)for(var t=0;t<this._.runningList.length;t++){var e=this._.runningList[t];e._utc=Date.now()/1e3-(this.media.currentTime-e.time)}var i=this,n=function(t,e,i,n){return function(){t(this._.stage);var s=Date.now()/1e3,r=this.media?this.media.currentTime:s,h=this.media?this.media.playbackRate:1,o=null,d=0,u=0;for(u=this._.runningList.length-1;u>=0;u--)o=this._.runningList[u],r-(d=this.media?o.time:o._utc)>this._.duration&&(n(this._.stage,o),this._.runningList.splice(u,1));for(var m=[];this._.position<this.comments.length&&(o=this.comments[this._.position],!((d=this.media?o.time:o._utc)>=r));)r-d>this._.duration||(this.media&&(o._utc=s-(this.media.currentTime-o.time)),m.push(o)),++this._.position;for(e(this._.stage,m),u=0;u<m.length;u++)(o=m[u]).y=a.call(this,o),this._.runningList.push(o);for(u=0;u<this._.runningList.length;u++){o=this._.runningList[u];var c=(this._.width+o.width)*(s-o._utc)*h/this._.duration;"ltr"===o.mode&&(o.x=c-o.width+.5|0),"rtl"===o.mode&&(o.x=this._.width-c+.5|0),"top"!==o.mode&&"bottom"!==o.mode||(o.x=this._.width-o.width>>1),i(this._.stage,o)}}}(this._.engine.framing.bind(this),this._.engine.setup.bind(this),this._.engine.render.bind(this),this._.engine.remove.bind(this));return this._.requestID=d((function t(){n.call(i),i._.requestID=d(t)})),this}function g(){return!this._.visible||this._.paused||(this._.paused=!0,u(this._.requestID),this._.requestID=0),this}function _(){if(!this.media)return this;this.clear(),f(this._.space);var t=m(this.comments,"time",this.media.currentTime);return this._.position=Math.max(0,t-1),this}function v(t){t.play=p.bind(this),t.pause=g.bind(this),t.seeking=_.bind(this),this.media.addEventListener("play",t.play),this.media.addEventListener("pause",t.pause),this.media.addEventListener("playing",t.play),this.media.addEventListener("waiting",t.pause),this.media.addEventListener("seeking",t.seeking)}function w(t){this.media.removeEventListener("play",t.play),this.media.removeEventListener("pause",t.pause),this.media.removeEventListener("playing",t.play),this.media.removeEventListener("waiting",t.pause),this.media.removeEventListener("seeking",t.seeking),t.play=null,t.pause=null,t.seeking=null}function y(t){this._={},this.container=t.container||document.createElement("div"),this.media=t.media,this._.visible=!0,this.engine=(t.engine||"DOM").toLowerCase(),this._.engine="canvas"===this.engine?o:i,this._.requestID=0,this._.speed=Math.max(0,t.speed)||144,this._.duration=4,this.comments=t.comments||[],this.comments.sort((function(t,e){return t.time-e.time}));for(var e=0;e<this.comments.length;e++)this.comments[e].mode=c(this.comments[e].mode);return this._.runningList=[],this._.position=0,this._.paused=!0,this.media&&(this._.listener={},v.call(this,this._.listener)),this._.stage=this._.engine.init(this.container),this._.stage.style.cssText+="position:relative;pointer-events:none;",this.resize(),this.container.appendChild(this._.stage),this._.space={},f(this._.space),this.media&&this.media.paused||(_.call(this),p.call(this)),this}function x(){if(!this.container)return this;for(var t in g.call(this),this.clear(),this.container.removeChild(this._.stage),this.media&&w.call(this,this._.listener),this)Object.prototype.hasOwnProperty.call(this,t)&&(this[t]=null);return this}var b=["mode","time","text","render","style"];function L(t){if(!t||"[object Object]"!==Object.prototype.toString.call(t))return this;for(var e={},i=0;i<b.length;i++)void 0!==t[b[i]]&&(e[b[i]]=t[b[i]]);if(e.text=(e.text||"").toString(),e.mode=c(e.mode),e._utc=Date.now()/1e3,this.media){var n=0;void 0===e.time?(e.time=this.media.currentTime,n=this._.position):(n=m(this.comments,"time",e.time))<this._.position&&(this._.position+=1),this.comments.splice(n,0,e)}else this.comments.push(e);return this}function T(){return this._.visible?this:(this._.visible=!0,this.media&&this.media.paused||(_.call(this),p.call(this)),this)}function E(){return this._.visible?(g.call(this),this.clear(),this._.visible=!1,this):this}function k(){return this._.engine.clear(this._.stage,this._.runningList),this._.runningList=[],this}function C(){return this._.width=this.container.offsetWidth,this._.height=this.container.offsetHeight,this._.engine.resize(this._.stage,this._.width,this._.height),this._.duration=this._.width/this._.speed,this}var D={get:function(){return this._.speed},set:function(t){return"number"!=typeof t||isNaN(t)||!isFinite(t)||t<=0?this._.speed:(this._.speed=t,this._.width&&(this._.duration=this._.width/t),t)}};function z(t){t&&y.call(this,t)}return z.prototype.destroy=function(){return x.call(this)},z.prototype.emit=function(t){return L.call(this,t)},z.prototype.show=function(){return T.call(this)},z.prototype.hide=function(){return E.call(this)},z.prototype.clear=function(){return k.call(this)},z.prototype.resize=function(){return C.call(this)},Object.defineProperty(z.prototype,"speed",D),z}));
  /* eslint-enable */

  class EDE {
    constructor() {
      this.chConvert = 1;
      if (window.localStorage.getItem('chConvert')) {
        this.chConvert = window.localStorage.getItem('chConvert');
      }
      // 0:当前状态关闭 1:当前状态打开
      this.danmakuSwitch = 1;
      if (window.localStorage.getItem('danmakuSwitch')) {
        this.danmakuSwitch = parseInt(window.localStorage.getItem('danmakuSwitch'));
      }
      this.danmaku = null;
      this.episode_info = null;
      this.ob = null;
      this.loading = false;
      this.showDanmakuInfo = true; // 添加新属性
      if (window.localStorage.getItem('showDanmakuInfo') !== null) {
        this.showDanmakuInfo = window.localStorage.getItem('showDanmakuInfo') === 'true';
      }
      this.originalCount = 0; // 添加原始弹幕数量属性
      this.lastError = null;
      this.corsStatus = '未测试';
      this.autoMatchStatus = '未开始';
      this.lastApiResponse = null;
      this.filterWords = window.localStorage.getItem('danmakuFilterWords') ?
      JSON.parse(window.localStorage.getItem('danmakuFilterWords')) : [];
      this.cacheEnabled = window.localStorage.getItem('danmakuCacheEnabled') !== 'false'; // 默认启用缓存
      this.buttonOrder = window.localStorage.getItem('danmakuButtonOrder') ?
      JSON.parse(window.localStorage.getItem('danmakuButtonOrder')) :
      ['displayDanmaku', 'danmakuSettings', 'filterSettings', 'switchDanmakuInfo', 'searchDanmaku', 'showDanmakuLog'];
      
      // 添加代理相关配置
      this.currentProxyIndex = 0;
      this.customProxyServer = window.localStorage.getItem('danmakuCustomProxy') || '';
      const savedProxyIndex = window.localStorage.getItem('danmakuProxyIndex');
      if (savedProxyIndex !== null) {
        this.currentProxyIndex = parseInt(savedProxyIndex);
      }
    }
  }

  function createRangeSlider(opt, button) {
    let input = document.createElement('input', rangeSliderOptions);
    input.setAttribute('type', opt.type);
    input.setAttribute('step', opt.step);
    input.setAttribute('min', opt.min);
    input.setAttribute('max', opt.max);
    input.setAttribute('value', opt.value);
    input.oninput = opt.oninput;
    let sliderContainer = document.createElement('div');
    sliderContainer.className = sliderContainerOptions.class;
    sliderContainer.appendChild(input);
    let SliderWrapper = document.createElement('div');
    SliderWrapper.className = sliderWrapperOptions.class;
    SliderWrapper.appendChild(sliderContainer);
    let sliderdiv = document.createElement('div');
    sliderdiv.className = sliderdivOptions.class;
    sliderdiv.style = sliderdivOptions.style;
    sliderdiv.appendChild(button);
    sliderdiv.appendChild(SliderWrapper);
    return sliderdiv;
  }

  function createButton(opt) {
    let button = document.createElement('button', buttonOptions);
    button.setAttribute('title', opt.title);
    button.setAttribute('id', opt.id);
    let icon = document.createElement('span');
    icon.className = 'md-icon';
    icon.innerText = opt.innerText;
    button.appendChild(icon);
    button.onclick = opt.onclick;
    return button;
  }

  function initListener() {
    let container = document.querySelector(mediaQueryStr);
    // 页面未加载
    if (!container) {
      if (window.ede.episode_info) {
        window.ede.episode_info = null;
      }
      return;
    }
    if (!container.getAttribute('ede_listening')) {
      console.log('正在初始化Listener');
      container.setAttribute('ede_listening', true);
      container.addEventListener('play', reloadDanmaku);
      reloadDanmaku();
      console.log('Listener初始化完成');
    }
  }

  function getElementsByInnerText(tagType, innerStr, excludeChildNode = true) {
    var temp = [];
    var elements = document.getElementsByTagName(tagType);
    if (!elements || 0 == elements.length) {
      return temp;
    }
    for (let index = 0; index < elements.length; index++) {
      var e = elements[index];
      if (e.innerText.includes(innerStr)) {
        temp.push(e);
      }
    }
    if (!excludeChildNode) {
      return temp;
    }
    var res = [];
    temp.forEach((e) => {
      var e_copy = e.cloneNode(true);
      while (e_copy.firstChild != e_copy.lastChild) {
        e_copy.removeChild(e_copy.lastChild);
      }
      if (e_copy.innerText.includes(innerStr)) {
        res.push(e);
      }
    });
    return res;
  }

  function initUI() {
    // 页面未加载
    let uiAnchor = getElementsByInnerText('i', uiAnchorStr);
    if (!uiAnchor || !uiAnchor[0]) {
      return;
    }
    // 不在播放页面
    let NotHideFlag = 0;
    let TargetIndex = null;
    for (let index = 0; index < uiAnchor.length; index++) {
      if (uiAnchor[index].parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.classList.contains('hide')) {
        continue;
      }
      else {
        NotHideFlag = 1;
        TargetIndex = index;
      }
    }
    if (!NotHideFlag) {
      return;
    }
    // 已初始化
    if (document.getElementById('danmakuCtr') && !document.getElementById('danmakuCtr').parentNode.parentNode.parentNode.parentNode.parentNode.classList.contains('hide')) {
      return;
    }
    // 开始初始化
    console.log('正在初始化UI');
    // 删除旧控件
    if (document.getElementById('danmakuCtr')) {
      document.getElementById('danmakuCtr').remove()
    }
    // 弹幕按钮容器div
    let parent = uiAnchor[TargetIndex].parentNode.parentNode.parentNode;
    let menubar = document.createElement('div');
    menubar.id = 'danmakuCtr';
    menubar.className = menubarOptions.class;
    if (!window.ede.episode_info) {
      menubar.style.opacity = 0.5;
    }
    parent.append(menubar);
    // 获取所有可用按钮配置
    const buttonConfigs = {
      displayDanmaku: { ...displayButtonOpts, label: '弹幕开关' },
      danmakuSettings: { ...settingsButtonOpts, label: '弹幕设置' },
      filterSettings: { ...filterSettingsButtonOpts, label: '过滤设置' },
      switchDanmakuInfo: { ...infoSwitchButtonOpts, label: '信息显示' },
      searchDanmaku: { ...searchButtonOpts, label: '搜索弹幕' },
      showDanmakuLog: { ...logButtonOpts, label: '调试日志' }
    };

    // 按照保存的顺序添加按钮
    window.ede.buttonOrder.forEach(buttonId => {
      const config = buttonConfigs[buttonId];
      if (config) {
        if (buttonId === 'displayDanmaku') {
          config.innerText = danmaku_icons[window.ede.danmakuSwitch];
        } else if (buttonId === 'switchDanmakuInfo') {
          config.innerText = info_switch_icons[window.ede.showDanmakuInfo ? 1 : 0];
        }
        menubar.appendChild(createButton(config));
      }
    });
    console.log('UI初始化完成');
  }

  function sendNotification(title, msg) {
    const Notification = window.Notification || window.webkitNotifications;
    console.log(msg);
    if (Notification.permission === 'granted') {
      return new Notification(title, {
        body: msg,
      });
    } else {
      Notification.requestPermission((permission) => {
        if (permission === 'granted') {
          return new Notification(title, {
            body: msg,
          });
        }
      });
    }
  }

  function getEmbyItemInfo() {
    return window.require(['pluginManager']).then((items) => {
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.pluginsList) {
            for (let j = 0; j < item.pluginsList.length; j++) {
              const plugin = item.pluginsList[j];
              if (plugin && plugin.id == 'htmlvideoplayer') {
                return plugin._currentPlayOptions ? plugin._currentPlayOptions.item : null;
              }
            }
          }
        }
      }
      return null;
    });
  }

  async function getEpisodeInfo(is_auto = true) {
    try {
      window.ede.autoMatchStatus = '开始获取视频信息';
      let item = await getEmbyItemInfo();

      if (!item) {
        window.ede.autoMatchStatus = '获取视频信息失败';
        window.ede.lastError = 'EmbyItemInfo is null';
        return null;
      }

      let _id = item.Type == 'Episode' ? item.SeasonId : item.Id;
      let animeName = item.Type == 'Episode' ? item.SeriesName : item.Name;
      let episode = item.Type == 'Episode' ? item.IndexNumber : 'movie';
      let originalTitle = item.OriginalTitle || (item.Type === 'Episode' ? item.SeriesOriginalTitle : null);

      if (item.Type == 'Episode' && item.ParentIndexNumber != 1) {
        animeName += ' ' + item.ParentIndexNumber;
      }

      // 保存当前播放项信息,供手动搜索使用
      window.ede._searchName = animeName;
      window.ede._originalTitle = originalTitle;
      window.ede._currentEpisode = episode === 'movie' ? 0 : episode - 1;

      const _id_key = '_anime_id_rel_' + _id;
      const _episode_key = '_episode_id_rel_' + _id + '_' + episode;

      // 检查本地缓存中是否有匹配结果
      if (is_auto && window.localStorage.getItem(_episode_key)) {
        return JSON.parse(window.localStorage.getItem(_episode_key));
      }

      // 如果是手动搜索，直接打开搜索对话框
      if (!is_auto) {
        await showSearchDialog();
        return null;
      }

      // 使用防重复搜索机制
      const now = Date.now();
      const searchKey = `_search_lock_${_id}`;
      const lastSearch = window.localStorage.getItem(searchKey);
      if (lastSearch) {
        const lastSearchData = JSON.parse(lastSearch);
        if (now - lastSearchData.timestamp < 60000) { // 1分钟内不重复搜索
          console.log('搜索冷却中，跳过自动匹配');
          return null;
        }
      }

      // 更新搜索时间戳
      window.localStorage.setItem(searchKey, JSON.stringify({ timestamp: now }));

      // 首先尝试使用中文名搜索
      let searchResult = await trySearch(animeName);

      // 如果中文名搜索失败且存在原始标题，则尝试使用原始标题搜索
      if (!searchResult && originalTitle && originalTitle !== animeName) {
        window.ede.autoMatchStatus = '使用原始标题重试搜索';
        searchResult = await trySearch(originalTitle);
      }

      if (!searchResult) {
        window.ede.autoMatchStatus = '自动匹配失败';
        return null;
      }

      return processSearchResult(searchResult, _id, _episode_key, episode);

    } catch (error) {
      window.ede.autoMatchStatus = '自动匹配失败';
      window.ede.lastError = error.stack;
      console.error('自动匹配失败:', error);
      return null;
    }
  }

  // 处理搜索结果的辅助函数
  function processSearchResult(animaInfo, _id, _episode_key, episode) {
    if (!animaInfo || !animaInfo.animes || animaInfo.animes.length === 0) {
      console.log('未找到匹配结果');
      return null;
    }

    const selectedAnime = animaInfo.animes[0];
    let selectedEpisode;

    if (episode === 'movie') {
      selectedEpisode = selectedAnime.episodes[0];
    } else {
      selectedEpisode = selectedAnime.episodes.find(ep => {
        const epNum = parseInt(ep.episodeTitle.match(/\d+/)?.[0] || '0');
        return epNum === episode;
      }) || selectedAnime.episodes[episode - 1];
    }

    if (!selectedEpisode) {
      console.log('未找到对应集数');
      return null;
    }

    const episodeInfo = {
      episodeId: selectedEpisode.episodeId,
      animeTitle: selectedAnime.animeTitle,
      episodeTitle: selectedAnime.type === 'tvseries' ? selectedEpisode.episodeTitle : null,
    };

    // 保存匹配结果
    window.localStorage.setItem('_anime_id_rel_' + _id, selectedAnime.animeId);
    window.localStorage.setItem(_episode_key, JSON.stringify(episodeInfo));

    window.ede.autoMatchStatus = '自动匹配成功';
    return episodeInfo;
  }

  // 添加搜索尝试函数
  async function trySearch(name) {
    if (!window.ede.cacheEnabled) {
      return searchAnimeDirectly(name);
    }

    const cacheKey = `_search_cache_${encodeURIComponent(name)}`;
    const cachedResult = window.localStorage.getItem(cacheKey);

    if (cachedResult) {
      const cached = JSON.parse(cachedResult);
      if (cached.timestamp > Date.now() - 24 * 60 * 60 * 1000) { // 24小时缓存
        window.ede.autoMatchStatus = '使用缓存结果';
        return cached.data;
      }
    }

    return searchAnimeDirectly(name);
  }

  // 在全局配置区域添加代理配置
  const defaultProxyServers = [
    'https://www.kumuze-dd.icu/'
  ];

  async function searchAnimeDirectly(name) {
    try {
      // 获取当前代理服务器
      const proxyServer = window.ede.customProxyServer || defaultProxyServers[window.ede.currentProxyIndex];
      const searchUrl = `${proxyServer}api/v2/search/episodes?anime=${encodeURIComponent(name)}`;
      
      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const animaInfo = await response.json();
      // ...existing code...
      if (!animaInfo || !animaInfo.animes || animaInfo.animes.length === 0) {
        return null;
      }

      if (window.ede.cacheEnabled) {
        // 只在启用缓存时才保存
        window.localStorage.setItem(`_search_cache_${encodeURIComponent(name)}`, JSON.stringify({
          timestamp: Date.now(),
          data: animaInfo
        }));
      }

      return animaInfo;
    } catch (error) {
      // 如果当前代理失败,尝试切换到备用代理
      if (!window.ede.customProxyServer && window.ede.currentProxyIndex < defaultProxyServers.length - 1) {
        window.ede.currentProxyIndex++;
        window.localStorage.setItem('danmakuProxyIndex', window.ede.currentProxyIndex);
        showTooltip(`正在切换到备用代理服务器 ${window.ede.currentProxyIndex + 1}`);
        return searchAnimeDirectly(name);
      }
      console.error('搜索失败:', error);
      return null;
    }
  }

  async function getComments(episodeId) {
    if (!window.ede.cacheEnabled) {
      return getCommentsDirectly(episodeId);
    }

    // 检查缓存
    const cacheKey = `_danmaku_cache_${episodeId}`;
    const cachedData = window.localStorage.getItem(cacheKey);

    if (cachedData) {
      const cached = JSON.parse(cachedData);
      if (cached.timestamp > Date.now() - 3600000) { // 1小时缓存
        console.log('使用缓存弹幕数据');
        return cached.comments;
      }
    }

    return getCommentsDirectly(episodeId);
  }

  async function getCommentsDirectly(episodeId) {
    try {
      const proxyServer = window.ede.customProxyServer || defaultProxyServers[window.ede.currentProxyIndex];
      const url = `${proxyServer}api/v2/comment/${episodeId}?withRelated=true&chConvert=${window.ede.chConvert}`;
      
      const response = await fetch(url);
      const responseText = await response.text();

      try {
        const data = JSON.parse(responseText);

        if (data.errorCode || data.hasError) {
          throw new Error(`API错误: ${data.errorMessage || data.message || '未知错误'}`);
        }

        if (!data.comments || !Array.isArray(data.comments)) {
          throw new Error('返回数据格式错误');
        }

        if (window.ede.cacheEnabled) {
          // 只在启用缓存时才保存
          window.localStorage.setItem(`_danmaku_cache_${episodeId}`, JSON.stringify({
            timestamp: Date.now(),
            comments: data.comments
          }));
        }

        console.log('弹幕下载成功: ' + data.comments.length);
        return data.comments;
      } catch (parseError) {
        window.ede.lastApiResponse = responseText;
        console.error('解析响应失败:', responseText);
        throw new Error(`解析响应失败: ${parseError.message}`);
      }
    } catch (error) {
      // 如果当前代理失败,尝试切换到备用代理
      if (!window.ede.customProxyServer && window.ede.currentProxyIndex < defaultProxyServers.length - 1) {
        window.ede.currentProxyIndex++;
        window.localStorage.setItem('danmakuProxyIndex', window.ede.currentProxyIndex);
        showTooltip(`正在切换到备用代理服务器 ${window.ede.currentProxyIndex + 1}`);
        return getCommentsDirectly(episodeId);
      }
      window.ede.lastError = error.stack;
      console.error('获取弹幕失败:', error);
      sendNotification('获取弹幕失败', error.message);
      return null;
    }
  }

  async function createDanmaku(comments) {
    if (!comments) return;

    window.ede.originalCount = comments.length;

    const videoElement = await waitForVideoElement();
    if (!videoElement) return;

    if (window.ede.danmaku) {
      window.ede.danmaku.clear();
      window.ede.danmaku.destroy();
      window.ede.danmaku = null;
    }

    // 预处理弹幕数据
    const _comments = danmakuFilter(danmakuParser(comments));
    globalOpacity = parseInt(window.localStorage.getItem('danmakuTransparencyLevel') || 100) / 100;

    const container = await waitForContainer();
    if (!container) return;

    window.ede.danmaku = new Danmaku({
      container,
      media: videoElement,
      comments: _comments,
      engine: 'canvas',
    });

    appendvideoOsdDanmakuInfo(_comments.length);

    if (window.ede.danmakuSwitch == 1) {
      window.ede.danmaku.show();
    } else {
      window.ede.danmaku.hide();
    }

    // 简化 resize 监听
    if (window.ede.ob) {
      window.ede.ob.disconnect();
    }
    window.ede.ob = new ResizeObserver(() => {
      if (window.ede.danmaku) {
        console.log('Resizing');
        window.ede.danmaku.resize();
      }
    });
    window.ede.ob.observe(container);
  }

  async function waitForVideoElement() {
    const video = document.querySelector(mediaQueryStr);
    if (video && video.readyState) {
      return video;
    }
    return null;
  }

  async function waitForContainer() {
    const containers = document.querySelectorAll(mediaContainerQueryStr);
    for (const container of containers) {
      if (!container.classList.contains('hide')) {
        return container;
      }
    }
    return null;
  }

  function reloadDanmaku(type = 'check') {
    if (window.ede.loading) {
      console.log('正在重新加载');
      return;
    }
    window.ede.loading = true;

    // 添加视频元素检查
    const videoElement = document.querySelector(mediaQueryStr);
    if (!videoElement || !videoElement.readyState) {
      console.log('视频元素未就绪，等待重试...');
      window.ede.loading = false;
      setTimeout(() => reloadDanmaku(type), 500);
      return;
    }

    if (type === 'reload') {
      // 强制清除缓存，确保简繁体切换后弹幕正确刷新
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('_danmaku_cache_')) {
          localStorage.removeItem(key);
        }
      });
    }

    getEpisodeInfo(type != 'search')
      .then((info) => {
        return new Promise((resolve, reject) => {
          if (!info) {
            appendvideoOsdDanmakuInfo();
            if (type != 'init') {
              reject('播放器未完成加载');
            } else {
              reject(null);
            }
          }
          if (type != 'search' && type != 'reload' && window.ede.danmaku && window.ede.episode_info && window.ede.episode_info.episodeId == info.episodeId) {
            reject('当前播放视频未变动');
          } else {
            window.ede.episode_info = info;
            resolve(info.episodeId);
          }
        });
      })
      .then(
        (episodeId) =>
          getComments(episodeId).then((comments) => {
            // 确保视频容器已准备就绪
            return new Promise((resolve) => {
              const checkContainer = () => {
                const container = document.querySelector(mediaContainerQueryStr);
                if (container && !container.classList.contains('hide')) {
                  resolve(comments);
                } else {
                  setTimeout(checkContainer, 200);
                }
              };
              checkContainer();
            }).then(comments => createDanmaku(comments));
          }),
        (msg) => {
          if (msg) {
            console.log(msg);
          }
        },
      )
      .then(() => {
        window.ede.loading = false;
        if (document.getElementById('danmakuCtr')) {
          document.getElementById('danmakuCtr').style.opacity = 1;
        }
      })
      .catch(error => {
        console.error('弹幕加载失败:', error);
        window.ede.loading = false;
      });
  }

  function danmakuFilter(comments) {
    let _comments = [...comments];
    // 类型过滤
    const typeFilters = window.localStorage.getItem('danmakuTypeFilter') ?
        JSON.parse(window.localStorage.getItem('danmakuTypeFilter')) : [];

    _comments = danmakuTypeFilter(_comments, typeFilters);

    // 关键词过滤
    const filterWords = window.ede.filterWords;
    if (filterWords.length > 0) {
      _comments = _comments.filter(comment =>
        !filterWords.some(word =>
          comment.text.toLowerCase().includes(word.toLowerCase())
        )
      );
    }

    // 密度过滤
    _comments = danmakuDensityLevelFilter(_comments);

    return _comments;
  }

  function danmakuTypeFilter(comments, filters) {
    if (!filters || filters.length === 0) return comments;

    // 彩色过滤,只留下默认的白色
    if (filters.includes(danmakuTypeFilterOpts.onlyWhite.id)) {
        comments = comments.filter(c => '#ffffff' === c.style.color.toLowerCase().slice(0, 7));
        filters = filters.filter(f => f !== danmakuTypeFilterOpts.onlyWhite.id);
    }

    // 过滤滚动弹幕(包含从左至右和从右至左)
    if (filters.includes(danmakuTypeFilterOpts.rolling.id)) {
        comments = comments.filter(c => c.mode !== 'ltr' && c.mode !== 'rtl');
        filters = filters.filter(f => f !== danmakuTypeFilterOpts.rolling.id);
    }

    // 按 emoji 过滤
    if (filters.includes(danmakuTypeFilterOpts.emoji.id)) {
        const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu;
        comments = comments.filter(c => !emojiRegex.test(c.text));
        filters = filters.filter(f => f !== danmakuTypeFilterOpts.emoji.id);
    }

    // 过滤特定模式的弹幕
    if (filters.length > 0) {
        comments = comments.filter(c => !filters.includes(c.mode));
    }

    return comments;
  }

  function danmakuDensityLevelFilter(comments) {
    let level = parseInt(window.localStorage.getItem('danmakuFilterLevel') ? window.localStorage.getItem('danmakuFilterLevel') : 0);
    if (level == 0) {
      return comments;
    }
    // 修改极限等级的限制
    let limit = level === 4 ? 3 : (9 - level * 2);
    let vertical_limit = level === 4 ? 2 : 6;
    let arr_comments = [];
    let vertical_comments = [];
    for (let index = 0; index < comments.length; index++) {
      let element = comments[index];
      let i = Math.ceil(element.time);
      let i_v = Math.ceil(element.time / 3);
      if (!arr_comments[i]) {
        arr_comments[i] = [];
      }
      if (!vertical_comments[i_v]) {
        vertical_comments[i_v] = [];
      }
      // TODO: 屏蔽过滤
      if (vertical_comments[i_v].length < vertical_limit) {
        vertical_comments[i_v].push(element);
      } else {
        element.mode = 'rtl';
      }
      if (arr_comments[i].length < limit) {
        arr_comments[i].push(element);
      }
    }
    return arr_comments.flat();
  }

  function danmakuParser($obj) {
    //const $xml = new DOMParser().parseFromString(string, 'text/xml')
    return $obj
      .map(($comment) => {
        const p = $comment.p;
        //if (p === null || $comment.childNodes[0] === undefined) return null
        const values = p.split(',');
        const mode = { 6: 'ltr', 1: 'rtl', 5: 'top', 4: 'bottom' }[values[1]];
        if (!mode) return null;
        //const fontSize = Number(values[2]) || 25
        const fontSize = parseInt(window.localStorage.getItem('danmakuFontSize')) || (isMobile ? fontSizeMobile : fontSizeDesktop);
        const color = `000000${Number(values[2]).toString(16)}`.slice(-6);
        return {
          text: $comment.m,
          mode,
          time: values[0] * 1,
          style: {
            fontSize: `${fontSize}px`,
            color: `#${color}`,
            textShadow:
              color === '000000' ? '-1px -1px #fff, -1px 1px #fff, 1px -1px #fff, 1px 1px #fff' : '-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000',

            font: `${fontSize}px sans-serif`,
            fillStyle: `#${color}`,
            strokeStyle: color === '000000' ? '#fff' : '#000',
            lineWidth: 2.0,
          },
        };
      })
      .filter((x) => x);
  }

  function list2string($obj2) {
    const $animes = $obj2.animes;
    let anime_lists = $animes.map(($single_anime) => {
      return $single_anime.animeTitle + ' 类型:' + $single_anime.typeDescription;
    });
    let anime_lists_str = '1:' + anime_lists[0];
    for (let i = 1; i < anime_lists.length; i++) {
      anime_lists_str = anime_lists_str + '\n' + (i + 1).toString() + ':' + anime_lists[i];
    }
    return anime_lists_str;
  }

  function ep2string($obj3) {
    const $animes = $obj3;
    let anime_lists = $animes.map(($single_ep) => {
      return $single_ep.episodeTitle;
    });
    let ep_lists_str = '1:' + anime_lists[0];
    for (let i = 1; i < anime_lists.length; i++) {
      ep_lists_str = ep_lists_str + '\n' + (i + 1).toString() + ':' + anime_lists[i];
    }
    return ep_lists_str;
  }

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
            title="使用日语标题搜索" style="color: #fff; padding: 0 1em; background: rgba(255, 255, 255, 0.1);">
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

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .emby-select:hover, .emby-input:hover {
        background: rgba(255, 255, 255, 0.15) !important;
      }
      .emby-select:focus, .emby-input:focus {
        background: rgba(255, 255, 255, 0.2) !important;
        outline: none;
      }
      #danmakuSwitchEpisode:hover {
        background: rgba(0, 164, 220, 0.3) !important;
        transform: translateY(-1px);
      }
      #danmakuSearchBtn:hover, #danmakuToggleTitle:hover {
        background: rgba(255, 255, 255, 0.2) !重要;
      }
      .noResults {
        padding: 2em;
        text-align: center;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        margin-top: 1em;
      }
    `;
    document.head.appendChild(style);

    // Get elements
    const searchInput = dialog.querySelector('#danmakuSearchName');
    const closeBtn = dialog.querySelector('#closeSearchDialog');
    const searchBtn = dialog.querySelector('#danmakuSearchBtn');
    const toggleBtn = dialog.querySelector('#danmakuToggleTitle');
    const selectDiv = dialog.querySelector('#danmakuAnimeSelect');
    const animeSelect = dialog.querySelector('#animeSelect');
    const episodeSelect = dialog.querySelector('#episodeSelect');
    const switchBtn = dialog.querySelector('#danmakuSwitchEpisode');
    const noResultsMsg = dialog.querySelector('#noResultsMsg');

    // Store animeInfo in dialog element
    let currentAnimeInfo = null;
    let searchPromise = null;

    // 填充搜索框
    if (window.ede._searchName) {
      searchInput.value = window.ede._searchName;
    }

    closeBtn.onclick = () => {
      if (searchPromise && searchPromise.cancel) {
        searchPromise.cancel();
      }
      dialog.remove();
    };

    dialog.addEventListener('close', () => {
      if (searchPromise && searchPromise.cancel) {
        searchPromise.cancel();
      }
      dialog.remove();
    });

    // 搜索框回车触发搜索
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        searchBtn.click();
      }
    });

    searchBtn.onclick = async () => {
      const searchName = searchInput.value.trim();
      if (!searchName) return;

      if (searchPromise && searchPromise.cancel) {
        searchPromise.cancel();
      }

      // 移除折叠逻辑
      selectDiv.style.display = 'block';

      try {
        searchPromise = searchAnime(searchName);
        currentAnimeInfo = await searchPromise;

        if (!currentAnimeInfo || currentAnimeInfo.animes.length === 0) {
          noResultsMsg.className = 'noResults';
          noResultsMsg.style.display = 'block';
          noResultsMsg.textContent = '未找到匹配结果';
          animeSelect.innerHTML = '';
          episodeSelect.innerHTML = '';
          return;
        }

        noResultsMsg.style.display = 'none';

        // 更新选项
        updateAnimeSelects(currentAnimeInfo, animeSelect, episodeSelect);
        updateAnimeImg(currentAnimeInfo.animes[0].animeId);

        // 自动定位到对应集数
        if (window.ede._currentEpisode !== undefined) {
          episodeSelect.value = window.ede._currentEpisode;
        }

        animeSelect.onchange = () => {
          const selectedAnime = currentAnimeInfo.animes[animeSelect.value];
          updateEpisodeSelect(selectedAnime);
          updateAnimeImg(selectedAnime.animeId);
        };

      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('Search canceled');
        } else {
          console.error('Search failed:', err);
          noResultsMsg.textContent = '搜索失败: ' + err.message;
        }
      }
    };

    toggleBtn.onclick = async () => {
      const item = await getEmbyItemInfo();
      if (item) {
        if (item.OriginalTitle) {
          searchInput.value = item.OriginalTitle;
        } else if (item.Type === 'Episode' && item.SeriesName) {
          const series = await ApiClient.getItem(ApiClient.getCurrentUserId(), item.SeriesId);
          if (series && series.OriginalTitle) {
            searchInput.value = series.OriginalTitle;
          }
        }
        searchBtn.click();
      }
    };

    switchBtn.onclick = async () => {
      if (!currentAnimeInfo) return;
      try {
        const selectedAnime = currentAnimeInfo.animes[animeSelect.value];
        const selectedEpisode = selectedAnime.episodes[episodeSelect.value];
        const episodeInfo = {
          episodeId: selectedEpisode.episodeId,
          animeTitle: selectedAnime.animeTitle,
          episodeTitle: selectedAnime.type === 'tvseries' ? selectedEpisode.episodeTitle : null,
        };

        // 保存匹配结果
        const item = await getEmbyItemInfo();
        if (item) {
          const _id = item.Type === 'Episode' ? item.SeasonId : item.Id;
          const episode = item.Type === 'Episode' ? item.IndexNumber : 'movie';
          const _id_key = '_anime_id_rel_' + _id;
          const _name_key = '_anime_name_rel_' + _id;
          const _episode_key = '_episode_id_rel_' + _id + '_' + episode;

          window.localStorage.setItem(_id_key, selectedAnime.animeId);
          window.localStorage.setItem(_name_key, selectedAnime.animeTitle);
          window.localStorage.setItem(_episode_key, JSON.stringify(episodeInfo));
        }

        window.ede.episode_info = episodeInfo;
        dialog.remove();
        reloadDanmaku('reload');
      } catch (err) {
        console.error('Failed to switch episode:', err);
        noResultsMsg.textContent = '切换失败: ' + err.message;
      }
    };

    // 自动执行搜索
    searchBtn.click();
    dialog.showModal();
  }

  // 添加可取消的搜索函数
  async function searchAnime(name) {
    const controller = new AbortController();
    const signal = controller.signal;

    try {
      // 获取当前代理服务器
      const proxyServer = window.ede.customProxyServer || defaultProxyServers[window.ede.currentProxyIndex];
      const searchUrl = `${proxyServer}api/v2/search/episodes?anime=${encodeURIComponent(name)}`;
      
      const promise = fetch(searchUrl, { signal })
        .then(response => response.json())
        .catch(error => {
          if (error.name === 'AbortError') {
            throw error;
          }
          console.log('查询失败:', error);
          return null;
        });

      // 添加取消功能
      promise.cancel = () => controller.abort();
      return promise;

    } catch (err) {
      console.error('Search failed:', err);
      throw err;
    }
  }

  function updateAnimeSelects(animeInfo, animeSelect, episodeSelect) {
    animeSelect.innerHTML = '';
    animeInfo.animes.forEach((anime, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `${anime.animeTitle} (${anime.typeDescription})`;
      animeSelect.appendChild(option);
    });

    updateEpisodeSelect(animeInfo.animes[0]);
  }

  function updateEpisodeSelect(anime) {
    const episodeSelect = document.querySelector('#episodeSelect');
    episodeSelect.innerHTML = '';
    if (!anime || !anime.episodes || anime.episodes.length === 0) {
      return;
    }
    anime.episodes.forEach((episode, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = episode.episodeTitle || `第${index + 1}话`;
      episodeSelect.appendChild(option);
    });
  }

  function updateAnimeImg(animeId) {
    const imgContainer = document.querySelector('#animeImgContainer');
    const animeImg = document.querySelector('#animeImg');
    imgContainer.style.display = 'block'; // 显示图片容器
    animeImg.src = `https://img.dandanplay.net/anime/${animeId}.jpg`;
  }

  // 在全局常量区域添加这个样式常量
  const videoOsdDanmakuInfoStyle = 'margin-left: auto; white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; position: absolute; right: 0px; bottom: 0px;';

  // 修改弹幕信息显示函数
  function appendvideoOsdDanmakuInfo(loadSum) {
    const episode_info = window.ede.episode_info || {};
    const { episodeId, animeTitle, episodeTitle } = episode_info;
    const videoOsdContainer = document.querySelector(`${mediaContainerQueryStr} .videoOsdSecondaryText`);
    let videoOsdDanmakuTitle = document.getElementById('videoOsdDanmakuTitle');

    if (!videoOsdDanmakuTitle) {
      videoOsdDanmakuTitle = document.createElement('h3');
      videoOsdDanmakuTitle.id = 'videoOsdDanmakuTitle';
      videoOsdDanmakuTitle.classList.add('videoOsdTitle');
      videoOsdDanmakuTitle.style = videoOsdDanmakuInfoStyle;
      videoOsdDanmakuTitle.style.display = window.ede.showDanmakuInfo ? 'block' : 'none';
    }

    let text = '弹幕：';
    if (episodeId) {
        text += `${animeTitle} - ${episodeTitle || ''} - ${loadSum}/${window.ede.originalCount}条`;
    } else {
        text += '未匹配';
    }

    videoOsdDanmakuTitle.innerText = text;
    if (videoOsdContainer) {
        videoOsdContainer.append(videoOsdDanmakuTitle);
    }
  }

  // 添加获取当前弹幕数量的辅助函数
  function getDanmakuComments(ede) {
    if (ede.danmaku && ede.danmaku.comments) {
      return ede.danmaku.comments;
    }
    return [];
  }

  async function showFilterDialog() {
    const filterDialogHtml = `
        <div style="display: flex; flex-direction: column; padding: 1em; background: #1f1f1f; color: #fff;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 1em;">
                <h3 style="margin: 0;">弹幕过滤设置</h3>
                <button is="emby-button" id="closeFilterDialog" class="paper-icon-button-light" title="关闭">
                    <span class="md-icon">close</span>
                </button>
            </div>
            <div id="filterTypeContainer" style="display: flex; flex-wrap: wrap;"></div>
        </div>
    `;

    const dialog = document.createElement('dialog');
    dialog.style = 'border: 0; width: 40%; min-width: 320px; max-width: 600px; background: transparent; padding: 0;';
    dialog.innerHTML = filterDialogHtml;
    document.body.appendChild(dialog);

    // 获取已保存的过滤类型
    const selectedTypes = window.localStorage.getItem('danmakuTypeFilter') ?
        JSON.parse(window.localStorage.getItem('danmakuTypeFilter')) : [];

    // 添加过滤选项
    const container = dialog.querySelector('#filterTypeContainer');
    Object.values(danmakuTypeFilterOpts).forEach(opt => {
        const checkbox = document.createElement('label');
        checkbox.style = 'margin: 0.5em; display: flex; align-items: center;';
        checkbox.innerHTML = `
            <input type="checkbox" is="emby-checkbox"
                ${selectedTypes.includes(opt.id) ? 'checked' : ''}
                value="${opt.id}">
            <span>${opt.name}</span>
        `;

        checkbox.querySelector('input').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const value = e.target.value;
            let types = window.localStorage.getItem('danmakuTypeFilter') ?
                JSON.parse(window.localStorage.getItem('danmakuTypeFilter')) : [];

            if (checked && !types.includes(value)) {
                types.push(value);
            } else if (!checked) {
                types = types.filter(t => t !== value);
            }

            window.localStorage.setItem('danmakuTypeFilter', JSON.stringify(types));
            reloadDanmaku('reload');
        });

        container.appendChild(checkbox);
    });

    dialog.querySelector('#closeFilterDialog').onclick = () => dialog.remove();
    dialog.showModal();
  }

  // 添加日志功能
  function showLogDialog() {
    const logDialogHtml = `
      <div style="display: flex; flex-direction: column; padding: 1em; background: #1f1f1f; color: #fff;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 1em;">
          <h3 style="margin: 0;">调试日志</h3>
          <button is="emby-button" id="toggleLogContent" class="paper-icon-button-light" title="展开/折叠日志">
            <span class="md-icon">expand_more</span>
          </button>
          <button is="emby-button" id="closeLogDialog" class="paper-icon-button-light" title="关闭">
            <span class="md-icon">close</span>
          </button>
        </div>
        
        <!-- 日志内容 - 默认折叠 -->
        <div id="logContent" style="display: none; white-space: pre-wrap; background: #333; padding: 1em; max-height: 400px; overflow-y: auto;"></div>

        <!-- 添加更多设置折叠面板 -->
        <div style="margin-top: 1em;">
          <button is="emby-button" id="toggleMoreSettings" class="raised"
            style="width: 100%; margin-bottom: 1em; text-align: left; padding: 0.7em;">
            <span class="md-icon" style="margin-right: 0.5em;">settings</span>
            更多设置
            <span class="md-icon" style="margin-left: auto;">expand_more</span>
          </button>
          <div id="moreSettings" style="display: none; background: rgba(255,255,255,0.05); padding: 1em; border-radius: 8px;">
            <!-- 缓存控制 -->
            <div style="margin-bottom: 1em;">
              <label style="display: flex; align-items: center; margin-bottom: 1em;">
                <input type="checkbox" is="emby-checkbox" id="cacheEnabledCheckbox">
                <span style="margin-left: 0.5em;">启用缓存</span>
              </label>
            </div>

            <!-- 功能排序区域 -->
            <div class="setting-section" style="margin-bottom: 1em;">
              <button is="emby-button" id="toggleButtonOrder" class="raised"
                style="width: 100%; text-align: left; padding: 0.7em; margin-bottom: 1em;">
                <span class="md-icon" style="margin-right: 0.5em;">sort</span>
                功能排序
                <span class="md-icon" style="margin-left: auto;">expand_more</span>
              </button>
              <div id="buttonOrderContainer" style="display: none; padding: 1em; background: rgba(0,0,0,0.2); border-radius: 8px;">
              </div>
            </div>

            <!-- 代理设置区域 -->
            <div class="setting-section">
              <button is="emby-button" id="toggleProxySettings" class="raised"
                style="width: 100%; text-align: left; padding: 0.7em; margin-bottom: 1em;">
                <span class="md-icon" style="margin-right: 0.5em;">dns</span>
                代理设置
                <span class="md-icon" style="margin-left: auto;">expand_more</span>
              </button>
              <div id="proxySettingsContainer" style="display: none; padding: 1em; background: rgba(0,0,0,0.2); border-radius: 8px;">
                <div style="display: flex; flex-direction: column; gap: 0.5em;">
                  <label>
                    <input type="radio" name="proxyType" value="default" 
                      ${!window.ede.customProxyServer ? 'checked' : ''}>
                    使用默认代理服务器
                  </label>
                  <div style="display: flex; align-items: center; gap: 0.5em;">
                    <label>
                      <input type="radio" name="proxyType" value="custom"
                        ${window.ede.customProxyServer ? 'checked' : ''}>
                      自定义代理服务器
                    </label>
                    <input type="text" is="emby-input" id="customProxyInput"
                      value="${window.ede.customProxyServer}"
                      placeholder="https://your-proxy-server/"
                      style="flex: 1; ${!window.ede.customProxyServer ? 'opacity: 0.5;' : ''}">
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
             gap: 0.5em; margin-top: 1em;">
          <button is="emby-button" id="refreshLogBtn" class="raised">刷新日志</button>
          <button is="emby-button" id="copyLogBtn" class="raised">复制日志</button>
          <button is="emby-button" id="testCorsBtn" class="raised">测试CORS</button>
          <button is="emby-button" id="clearCacheBtn" class="raised">清除缓存</button>
        </div>
      </div>
    `;

    const dialog = document.createElement('dialog');
    dialog.style = 'border: 0; width: 80%; max-width: 800px; background: transparent; padding: 0;';
    dialog.innerHTML = logDialogHtml;
    document.body.appendChild(dialog);

    // 获取所有需要的元素
    const toggleLogBtn = dialog.querySelector('#toggleLogContent');
    const logContent = dialog.querySelector('#logContent');
    const toggleMoreBtn = dialog.querySelector('#toggleMoreSettings');
    const moreSettings = dialog.querySelector('#moreSettings');
    const toggleButtonOrderBtn = dialog.querySelector('#toggleButtonOrder');
    const buttonOrderContainer = dialog.querySelector('#buttonOrderContainer');
    const toggleProxySettingsBtn = dialog.querySelector('#toggleProxySettings');
    const proxySettingsContainer = dialog.querySelector('#proxySettingsContainer');

    // 添加折叠/展开功能
    function setupToggle(toggleBtn, content, icon) {
        toggleBtn.onclick = () => {
            const isExpanded = content.style.display !== 'none';
            content.style.display = isExpanded ? 'none' : 'block';
            toggleBtn.querySelector('.md-icon:last-child').textContent =
                isExpanded ? 'expand_more' : 'expand_less';
        };
    }

    // 设置各个折叠面板的事件处理
    setupToggle(toggleLogBtn, logContent);
    setupToggle(toggleMoreBtn, moreSettings);
    setupToggle(toggleButtonOrderBtn, buttonOrderContainer);
    setupToggle(toggleProxySettingsBtn, proxySettingsContainer);

    // ...其余的事件处理代码保持不变...

    // 初始化日志内容
    const refreshLog = () => {
        logContent.textContent = generateLogContent();
    };
    refreshLog();

    // 初始化功能排序列表
    if (buttonOrderContainer) {
        updateButtonOrderList(buttonOrderContainer);
    }

    // 初始化代理设置
    const proxyTypeInputs = dialog.querySelectorAll('input[name="proxyType"]');
    const customProxyInput = dialog.querySelector('#customProxyInput');

    // 代理类型选择事件
    proxyTypeInputs.forEach(input => {
        input.addEventListener('change', () => {
            if (input.value === 'default') {
                window.ede.customProxyServer = '';
                customProxyInput.value = '';
                customProxyInput.style.opacity = '0.5';
                window.localStorage.removeItem('danmakuCustomProxy');
                window.ede.currentProxyIndex = 0;
                window.localStorage.setItem('danmakuProxyIndex', 0);
                showTooltip('已切换至默认代理服务器');
            } else {
                customProxyInput.style.opacity = '1';
            }
        });
    });

    // 自定义代理输入事件
    let proxyUpdateTimeout;
    customProxyInput.addEventListener('input', () => {
        clearTimeout(proxyUpdateTimeout);
        proxyUpdateTimeout = setTimeout(() => {
            const value = customProxyInput.value.trim();
            if (value && value !== window.ede.customProxyServer) {
                window.ede.customProxyServer = value;
                window.localStorage.setItem('danmakuCustomProxy', value);
                showTooltip('已更新自定义代理服务器');
            }
        }, 1000);
    });

    // 添加按钮事件处理
    // 刷新日志按钮
    dialog.querySelector('#refreshLogBtn').onclick = () => {
      logContent.textContent = generateLogContent();
    };

    // 复制日志按钮
    dialog.querySelector('#copyLogBtn').onclick = async () => {
      try {
        const logText = generateLogContent();
        // 使用临时文本区域来复制文本
        const textArea = document.createElement('textarea');
        textArea.value = logText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        showTooltip('日志已复制到剪贴板');
      } catch (err) {
        console.error('复制失败:', err);
        showTooltip('复制失败，请手动复制', 'error');
      }
    };

    // 测试CORS按钮
    dialog.querySelector('#testCorsBtn').onclick = async () => {
      try {
        const testBtn = dialog.querySelector('#testCorsBtn');
        testBtn.disabled = true;
        testBtn.textContent = '测试中...';
        window.ede.corsStatus = '测试中...';
        
        // 使用当前激活的代理服务器
        const proxyServer = window.ede.customProxyServer || defaultProxyServers[window.ede.currentProxyIndex];
        const testUrl = `${proxyServer}api/v2/search/episodes?anime=test`;
        
        const response = await fetch(testUrl);
        const data = await response.json();
        
        if (response.ok && data) {
          window.ede.corsStatus = '正常';
          window.ede.lastApiResponse = JSON.stringify(data).slice(0, 100) + '...';
          showTooltip('CORS测试通过');
        } else {
          window.ede.corsStatus = '异常: API响应无效';
          window.ede.lastApiResponse = JSON.stringify(data);
          showTooltip('CORS测试失败: API响应无效', 'error');
        }
      } catch (error) {
        window.ede.corsStatus = '异常: ' + error.message;
        window.ede.lastError = error.stack;
        window.ede.lastApiResponse = 'Error: ' + error.message;
        showTooltip('CORS测试失败: ' + error.message, 'error');
      } finally {
        const testBtn = dialog.querySelector('#testCorsBtn');
        testBtn.disabled = false;
        testBtn.textContent = '测试CORS';
        // 更新日志显示
        const logContent = dialog.querySelector('#logContent');
        if (logContent) {
          logContent.textContent = generateLogContent();
        }
      }
    };

    // 清除缓存按钮
    dialog.querySelector('#clearCacheBtn').onclick = () => {
      const keys = Object.keys(localStorage);
      let count = 0;
      for (const key of keys) {
        if (key.startsWith('_danmaku_cache_') || 
            key.startsWith('_search_cache_') || 
            key.startsWith('_search_lock_')) {
          localStorage.removeItem(key);
          count++;
        }
      }
      showTooltip(`已清除 ${count} 条缓存记录`);
      logContent.textContent = generateLogContent();
    };

    dialog.querySelector('#closeLogDialog').onclick = () => dialog.remove();
    dialog.showModal();

    const cacheEnabledCheckbox = dialog.querySelector('#cacheEnabledCheckbox');
    cacheEnabledCheckbox.checked = window.ede.cacheEnabled;
    cacheEnabledCheckbox.addEventListener('change', () => {
      window.ede.cacheEnabled = cacheEnabledCheckbox.checked;
      window.localStorage.setItem('cacheEnabled', cacheEnabledCheckbox.checked);
    });

    const style = document.createElement('style');
    style.textContent = `
      #toggleLogContent {
        position: relative;
      }
      #toggleLogContent .md-icon {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 50%;
        padding: 2px;
        transition: background 0.2s;
      }
      #toggleLogContent .md-icon:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    `;
    dialog.appendChild(style);
}

// ...existing code...

// 添加generateLogContent函数
function generateLogContent() {
    // 获取当前代理服务器地址，自定义代理显示实际地址，默认代理显示"默认服务器"
    const proxyServer = window.ede.customProxyServer || '默认服务器';
    
    let cacheSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('_danmaku_cache_') ||
          key.startsWith('_search_cache_')) {
        cacheSize += localStorage.getItem(key).length;
      }
    }

    return `User Agent: ${navigator.userAgent}
移动设备: ${isMobile}
视频元素: ${!!document.querySelector(mediaQueryStr)}
视频状态: ${document.querySelector(mediaQueryStr)?.readyState}
弹幕状态: ${!!window.ede?.danmaku}
原始弹幕数: ${window.ede?.originalCount || 0}
当前弹幕数: ${window.ede?.danmaku?.comments?.length || 0}
媒体容器: ${!!document.querySelector(mediaContainerQueryStr)}
弹幕开关: ${window.ede?.danmakuSwitch}
全局透明度: ${globalOpacity}
简繁转换: ${window.ede?.chConvert}
加载状态: ${window.ede?.loading}
当前播放信息: ${JSON.stringify(window.ede?.episode_info, null, 2)}
字体大小: ${isMobile ? fontSizeMobile : fontSizeDesktop}px
当前代理: ${proxyServer}
最后错误: ${window.ede?.lastError || '无'}
CORS状态: ${window.ede?.corsStatus || '未测试'}
自动匹配状态: ${window.ede?.autoMatchStatus || '未开始'}
API响应: ${window.ede?.lastApiResponse || '无'}
缓存信息:
- 搜索缓存: ${Object.keys(localStorage).filter(k =>
  k.startsWith('_search_cache_')).length} 条
- 弹幕缓存: ${Object.keys(localStorage).filter(k =>
  k.startsWith('_danmaku_cache_')).length} 条
- 总大小: ${(cacheSize / 1024 / 1024).toFixed(2)} MB`;
}

  function showDanmakuSettingsDialog() {
    const settingsDialogHtml = `
      <div style="display: flex; flex-direction: column; padding: 1.5em; background: rgba(31, 31, 31, 0.9);
           color: #fff; border-radius: 12px; backdrop-filter: blur(10px);">
        <div style="display: flex; justify-content: space-between; margin-bottom: 1.5em;">
          <h3 style="margin: 0;">弹幕设置</h3>
          <div>
            <button is="emby-button" id="resetSettingsDialog" class="paper-icon-button-light"
              title="还原默认值" style="margin-right: 0.5em;">
              <span class="md-icon">${reset_icon}</span>
            </button>
            <button is="emby-button" id="closeSettingsDialog" class="paper-icon-button-light" title="关闭">
              <span class="md-icon">close</span>
            </button>
          </div>
        </div>
        <div class="settings-container" style="background: rgba(0, 0, 0, 0.2); padding: 1em; border-radius: 8px;">
          <div class="sliderdiv" style="display: flex; flex-direction: column; margin-bottom: 1.5em;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5em;">
              <label class="sliderLabel">字体大小</label>
              <span id="fontSizeValue" style="min-width: 3em; text-align: right;"></span>
            </div>
            <div class="sliderContainer">
              <input type="range" is="emby-slider" id="fontSizeSlider"
                min="12" max="48" step="1"
                value="${window.localStorage.getItem('danmakuFontSize') || (isMobile ? fontSizeMobile : fontSizeDesktop)}"
                class="emby-slider">
            </div>
          </div>
          <div class="sliderdiv" style="display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5em;">
              <label class="sliderLabel">不透明度</label>
              <span id="transparencyValue" style="min-width: 3em; text-align: right;"></span>
            </div>
            <div class="sliderContainer">
              <input type="range" is="emby-slider" id="transparencySlider"
                min="0" max="100" step="1"
                value="${window.localStorage.getItem('danmakuTransparencyLevel') || '100'}"
                class="emby-slider">
            </div>
          </div>
        </div>
      </div>
    `;

    const dialog = document.createElement('dialog');
    dialog.style = 'border: 0; width: 40%; min-width: 320px; max-width: 600px; background: transparent; padding: 0;';
    dialog.innerHTML = settingsDialogHtml;
    document.body.appendChild(dialog);

    // 获取元素
    const transparencySlider = dialog.querySelector('#transparencySlider');
    const fontSizeSlider = dialog.querySelector('#fontSizeSlider');
    const transparencyValue = dialog.querySelector('#transparencyValue');
    const fontSizeValue = dialog.querySelector('#fontSizeValue');

    // 更新滑块样式的函数
    function updateSliderStyle(slider) {
      const value = slider.value;
      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      const percentage = ((value - min) / (max - min)) * 100;

      // 添加滑块位置样式
      slider.style.background = `linear-gradient(to right, #00a4dc 0%, #00a4dc ${percentage}%, #666 ${percentage}%, #666 100%)`;

      // 更新滑块thumb位置
      const thumbElem = slider.parentNode.querySelector('.emby-slider-thumb');
      if (thumbElem) {
        thumbElem.style.left = `${percentage}%`;
      }
    }

    // 更新显示值和应用设置
    function updateTransparency(value) {
      transparencyValue.textContent = value + '%';
      window.localStorage.setItem('danmakuTransparencyLevel', value);
      globalOpacity = value / 100;
      updateSliderStyle(transparencySlider);
    }

    function updateFontSize(value) {
      fontSizeValue.textContent = value + 'px';
      window.localStorage.setItem('danmakuFontSize', value);
      updateSliderStyle(fontSizeSlider);
      if (window.ede.danmaku) {
        reloadDanmaku('reload');
      }
    }

    // 等待 DOM 完全渲染后初始化滑块位置
    requestAnimationFrame(() => {
      // 初始化透明度滑块
      const savedTransparency = window.localStorage.getItem('danmakuTransparencyLevel') || '100';
      transparencySlider.value = savedTransparency;
      updateTransparency(savedTransparency);

      // 初始化字体大小滑块
      const savedFontSize = window.localStorage.getItem('danmakuFontSize') || (isMobile ? fontSizeMobile : fontSizeDesktop);
      fontSizeSlider.value = savedFontSize;
      updateFontSize(savedFontSize);
    });

    // 添加事件监听
    transparencySlider.oninput = (e) => updateTransparency(e.target.value);
    fontSizeSlider.oninput = (e) => updateFontSize(e.target.value);

    // 还原默认值
    dialog.querySelector('#resetSettingsDialog').onclick = () => {
      const defaultFontSize = isMobile ? fontSizeMobile : fontSizeDesktop;
      fontSizeSlider.value = defaultFontSize;
      transparencySlider.value = 100;
      updateFontSize(defaultFontSize);
      updateTransparency(100);
    };

    dialog.querySelector('#closeSettingsDialog').onclick = () => dialog.remove();
    dialog.showModal();
  }

  // 添加过滤设置按钮配置
  const filterSettingsButtonOpts = {
    title: '过滤设置',
    id: 'filterSettings',
    innerText: filter_icons[0],
    onclick: () => {
      showFilterSettingsDialog();
    },
  };

  // 添加过滤设置对话框函数
  function showFilterSettingsDialog() {
    const filterSettingsDialogHtml = `
      <div style="display: flex; flex-direction: column; padding: 2em; background: rgba(31, 31, 31, 0.95);
           color: #fff; border-radius: 16px; backdrop-filter: blur(20px); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2em;">
          <h3 style="margin: 0; font-size: 1.5em; font-weight: 500;">过滤设置</h3>
          <button is="emby-button" id="closeFilterSettingsDialog" class="paper-icon-button-light"
            title="关闭" style="margin: -0.5em; padding: 0.5em;">
            <span class="md-icon" style="font-size: 1.5em;">close</span>
          </button>
        </div>

        <div class="settings-container" style="background: rgba(0, 0, 0, 0.2); padding: 1.5em; border-radius: 12px;
             box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.2);">
          <!-- 简繁转换设置 -->
          <div class="setting-group" style="margin-bottom: 2em;">
            <h4 style="margin: 0 0 1em 0; font-size: 1.1em; color: #00a4dc;">简繁转换</h4>
            <div class="radio-group" style="display: flex; flex-wrap: wrap; gap: 1em;">
              <label style="background: rgba(255, 255, 255, 0.1); padding: 0.7em 1.2em; border-radius: 8px; cursor: pointer;
                     transition: all 0.2s ease;">
                <input type="radio" name="chConvert" value="0" class="emby-radio-button">
                <span>不转换</span>
              </label>
              <label style="background: rgba(255, 255, 255, 0.1); padding: 0.7em 1.2em; border-radius: 8px; cursor: pointer;
                     transition: all 0.2s ease;">
                <input type="radio" name="chConvert" value="1" class="emby-radio-button">
                <span>转简体</span>
              </label>
              <label style="background: rgba(255, 255, 255, 0.1); padding: 0.7em 1.2em; border-radius: 8px; cursor: pointer;
                     transition: all 0.2s ease;">
                <input type="radio" name="chConvert" value="2" class="emby-radio-button">
                <span>转繁体</span>
              </label>
            </div>
          </div>

          <!-- 过滤等级设置 -->
          <div class="setting-group" style="margin-bottom: 2em;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5em;">
              <h4 style="margin: 0; font-size: 1.1em; color: #00a4dc;">过滤等级</h4>
              <span id="filterLevelValue" style="min-width: 3em; text-align: right; font-weight: 500;"></span>
            </div>
            <div class="sliderContainer">
              <input type="range" is="emby-slider" id="filterLevelSlider"
                min="0" max="4" step="1"
                value="${window.localStorage.getItem('danmakuFilterLevel') || '0'}"
                class="emby-slider">
            </div>
          </div>

          <!-- 高级过滤选项 -->
          <div class="setting-group">
            <h4 style="margin: 0 0 1em 0; font-size: 1.1em; color: #00a4dc;">高级过滤</h4>
            <div id="advancedFilterContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                 gap: 0.8em;">
            </div>
          </div>

          <!-- 添加关键词过滤部分 -->
          <div class="setting-group" style="margin-bottom: 2em;">
            <h4 style="margin: 0 0 1em 0; font-size: 1.1em; color: #00a4dc;">关键词过滤</h4>
            <div style="display: flex; gap: 1em; margin-bottom: 1em;">
              <input type="text" is="emby-input" id="filterWordInput"
                placeholder="输入要过滤的关键词"
                style="flex: 1; background: rgba(255, 255, 255, 0.1); color: #fff;
                       border: none; border-radius: 8px; padding: 0.7em;">
              <button is="emby-button" id="addFilterWord"
                style="background: rgba(0, 164, 220, 0.2); color: #00a4dc;
                       border-radius: 8px; padding: 0.7em 1.5em;">
                添加
              </button>
            </div>
            <div id="filterWordList" style="display: flex; flex-wrap: wrap; gap: 0.5em;">
            </div>
          </div>
        </div>
      </div>
    `;

    const dialog = document.createElement('dialog');
    dialog.style = 'border: 0; width: 40%; min-width: 320px; max-width: 600px; background: transparent; padding: 0;';
    dialog.innerHTML = filterSettingsDialogHtml;
    document.body.appendChild(dialog);

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .radio-group label:hover {
        background: rgba(255, 255, 255, 0.15) !important;
      }
      .radio-group label:has(input:checked) {
        background: rgba(0, 164, 220, 0.3) !important;
      }
      #advancedFilterContainer label {
        background: rgba(255, 255, 255, 0.1);
        padding: 0.7em 1em;
        border-radius: 8px;
        transition: all 0.2s ease;
      }
      #advancedFilterContainer label:hover {
        background: rgba(255, 255, 255, 0.15);
      }
      #advancedFilterContainer label:has(input:checked) {
        background: rgba(0, 164, 220, 0.3);
      }
      .emby-slider {
        --track-height: 6px;
        --thumb-size: 16px;
      }
      .emby-slider::-webkit-slider-thumb {
        width: var(--thumb-size);
        height: var(--thumb-size);
        background: #00a4dc;
        border: none;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
      }
      .emby-slider::-webkit-slider-thumb:hover {
        transform: scale(1.1);
      }
      .emby-slider::-webkit-slider-runnable-track {
        height: var(--track-height);
        border-radius: 3px;
      }
    `;
    document.head.appendChild(style);

    // 初始化简繁转换
    const currentChConvert = window.localStorage.getItem('chConvert') || '1';
    dialog.querySelector(`input[name="chConvert"][value="${currentChConvert}"]`).checked = true;

    // 初始化过滤等级
    const filterLevelSlider = dialog.querySelector('#filterLevelSlider');
    const filterLevelValue = dialog.querySelector('#filterLevelValue');
    const filterLevels = ['关闭', '弱', '中', '强', '极限'];
    const filterColors = ['#666', '#4CAF50', '#FFC107', '#f44336', '#9C27B0'];

    function updateFilterLevel(value) {
      const intValue = parseInt(value);
      filterLevelValue.textContent = filterLevels[intValue];
      filterLevelValue.style.color = filterColors[intValue];
      window.localStorage.setItem('danmakuFilterLevel', value);

      const percentage = (intValue / 4) * 100;
      filterLevelSlider.style.background = `linear-gradient(to right,
        ${filterColors[intValue]} 0%,
        ${filterColors[intValue]} ${percentage}%,
        rgba(255, 255, 255, 0.2) ${percentage}%,
        rgba(255, 255, 255, 0.2) 100%)`;

      // 更新滑块thumb位置
      const thumbElem = filterLevelSlider.parentNode.querySelector('.emby-slider-thumb');
      if (thumbElem) {
        thumbElem.style.left = `${percentage}%`;
      }
    }

    // 等待 DOM 完全渲染后初始化滑块位置
    requestAnimationFrame(() => {
      const savedFilterLevel = window.localStorage.getItem('danmakuFilterLevel') || '0';
      filterLevelSlider.value = savedFilterLevel;
      updateFilterLevel(savedFilterLevel);
    });

    // 添加事件监听
    filterLevelSlider.oninput = (e) => {
      updateFilterLevel(e.target.value);
      reloadDanmaku('reload');
    };

    // 初始化高级过滤选项
    const advancedFilterContainer = dialog.querySelector('#advancedFilterContainer');
    const selectedTypes = window.localStorage.getItem('danmakuTypeFilter') ?
      JSON.parse(window.localStorage.getItem('danmakuTypeFilter')) : [];

    Object.values(danmakuTypeFilterOpts).forEach(opt => {
      const checkbox = document.createElement('label');
      checkbox.innerHTML = `
        <input type="checkbox" is="emby-checkbox"
          ${selectedTypes.includes(opt.id) ? 'checked' : ''}
          value="${opt.id}"
          style="margin-right: 0.5em;">
        <span style="font-weight: 500;">${opt.name}</span>
      `;

      checkbox.querySelector('input').addEventListener('change', (e) => {
        const checked = e.target.checked;
        const value = e.target.value;
        let types = window.localStorage.getItem('danmakuTypeFilter') ?
          JSON.parse(window.localStorage.getItem('danmakuTypeFilter')) : [];

        if (checked && !types.includes(value)) {
          types.push(value);
        } else if (!checked) {
          types = types.filter(t => t !== value);
        }

        window.localStorage.setItem('danmakuTypeFilter', JSON.stringify(types));
        reloadDanmaku('reload');
      });

      advancedFilterContainer.appendChild(checkbox);
    });

    // 简繁转换事件监听
    dialog.querySelectorAll('input[name="chConvert"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          window.ede.chConvert = parseInt(e.target.value);
          window.localStorage.setItem('chConvert', e.target.value);
          reloadDanmaku('reload');
        }
      });
    });

    // 添加关键词过滤功能
    const filterWordInput = dialog.querySelector('#filterWordInput');
    const addFilterWordBtn = dialog.querySelector('#addFilterWord');
    const filterWordList = dialog.querySelector('#filterWordList');

    function updateFilterWordList() {
      filterWordList.innerHTML = '';
      window.ede.filterWords.forEach(word => {
        const wordChip = document.createElement('div');
        wordChip.style.cssText = `
          background: rgba(0, 164, 220, 0.2);
          color: #00a4dc;
          padding: 0.5em 1em;
          border-radius: 1em;
          display: flex;
          align-items: center;
          gap: 0.5em;
        `;
        wordChip.innerHTML = `
          <span>${word}</span>
          <button class="removeWord" style="background: none; border: none; color: #00a4dc;
                                          padding: 0; cursor: pointer;">×</button>
        `;
        wordChip.querySelector('.removeWord').onclick = () => {
          window.ede.filterWords = window.ede.filterWords.filter(w => w !== word);
          window.localStorage.setItem('danmakuFilterWords',
            JSON.stringify(window.ede.filterWords));
          updateFilterWordList();
          reloadDanmaku('reload');
        };
        filterWordList.appendChild(wordChip);
      });
    }

    addFilterWordBtn.onclick = () => {
      const word = filterWordInput.value.trim();
      if (word && !window.ede.filterWords.includes(word)) {
        window.ede.filterWords.push(word);
        window.localStorage.setItem('danmakuFilterWords',
          JSON.stringify(window.ede.filterWords));
        filterWordInput.value = '';
        updateFilterWordList();
        reloadDanmaku('reload');
      }
    };

    updateFilterWordList();

    dialog.querySelector('#closeFilterSettingsDialog').onclick = () => dialog.remove();
    dialog.showModal();
  }

  while (!window.require) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!window.ede) {
    window.ede = new EDE();

    setInterval(() => {
      initUI();
    }, check_interval);

    // 直接初始化弹幕,不等待
    reloadDanmaku('init');

    setInterval(() => {
      initListener();
    }, check_interval);
  }

  // 将函数定义移动到这里, IIFE内部
  function updateButtonOrderList(container) {
    container.innerHTML = '';
    const buttonConfigs = {
      displayDanmaku: '弹幕开关',
      danmakuSettings: '弹幕设置',
      filterSettings: '过滤设置',
      switchDanmakuInfo: '信息显示',
      searchDanmaku: '搜索弹幕',
      showDanmakuLog: '调试日志'
    };

    // 添加还原按钮
    const resetButton = document.createElement('button');
    resetButton.className = 'reset-order-button paper-icon-button-light';
    resetButton.innerHTML = `<span class="md-icon">${reset_icon}</span> <span>还原默认顺序</span>`;
    resetButton.onclick = async () => {
      const defaultOrder = ['displayDanmaku', 'danmakuSettings', 'filterSettings', 'switchDanmakuInfo', 'searchDanmaku', 'showDanmakuLog'];
      window.ede.buttonOrder = defaultOrder;
      window.localStorage.setItem('danmakuButtonOrder', JSON.stringify(defaultOrder));
      updateButtonOrderList(container);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      if (document.getElementById('danmakuCtr')) {
        const danmakuCtr = document.getElementById('danmakuCtr');
        danmakuCtr.remove();
        await new Promise(resolve => setTimeout(resolve, 0));
        initUI();
      }
      
      showTooltip('已还原默认按钮顺序');
    };
    container.appendChild(resetButton);

    // 创建按钮列表
    const buttonList = document.createElement('div');
    buttonList.className = 'button-order-list';
    container.appendChild(buttonList);

    window.ede.buttonOrder.forEach((buttonId, index) => {
      if (!buttonConfigs[buttonId]) return;

      const item = document.createElement('div');
      item.className = 'button-order-item';
      item.setAttribute('draggable', 'true');
      item.setAttribute('data-button-id', buttonId);
      item.setAttribute('data-index', index);
      item.innerHTML = `
        <div class="button-order-content">
          <span class="md-icon handle">drag_indicator</span>
          <span class="button-name">${buttonConfigs[buttonId]}</span>
          <span class="order-number">#${index + 1}</span>
        </div>
      `;

      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', index);
        item.classList.add('dragging');
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingItem = document.querySelector('.dragging');
        if (draggingItem !== item) {
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = index;
        
        if (fromIndex === toIndex) return;

        const newOrder = [...window.ede.buttonOrder];
        const [movedItem] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, movedItem);

        window.ede.buttonOrder = newOrder;
        window.localStorage.setItem('danmakuButtonOrder', JSON.stringify(newOrder));

        updateButtonOrderList(container);
        
        if (document.getElementById('danmakuCtr')) {
          document.getElementById('danmakuCtr').remove();
          initUI();
        }

        showTooltip('按钮顺序已更新');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document.querySelectorAll('.button-order-item').forEach(item => {
          item.classList.remove('drag-over');
        });
      });

      buttonList.appendChild(item);
    });

    // 添加样式
    if (!document.querySelector('#button-order-styles')) {
      const style = document.createElement('style');
      style.id = 'button-order-styles';
      style.textContent = `
        .button-order-list { display: flex; flex-direction: column; gap: 8px; }
        .button-order-item {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          transition: all 0.2s ease;
        }
        .button-order-content {
          display: flex;
          align-items: center;
          padding: 12px;
          gap: 12px;
          cursor: move;
        }
        .button-order-item .handle { opacity: 0.7; }
        .button-order-item .button-name { flex: 1; }
        .button-order-item .order-number { opacity: 0.5; }
        .button-order-item.dragging { opacity: 0.5; background: rgba(0, 164, 220, 0.2); }
        .button-order-item.drag-over { transform: translateY(2px); box-shadow: 0 -2px 0 #00a4dc; }
        .button-order-item:hover { background: rgba(255, 255, 255, 0.15); }
        .reset-order-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          margin-bottom: 12px;
          padding: 8px;
          background: rgba(0, 164, 220, 0.1);
          color: #00a4dc;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }
        .reset-order-button:hover {
          background: rgba(0, 164, 220, 0.2);
          transform: translateY(-1px);
        }
        .reset-order-button .md-icon { font-size: 18px; }
      `;
      document.head.appendChild(style);
    }
  }

  function showTooltip(message, type = 'info') {
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'error' ? 'rgba(244, 67, 54, 0.9)' : 'rgba(0, 0, 0, 0.9)'};
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      transition: opacity 0.3s ease;
    `;
    tooltip.textContent = message;
    document.body.appendChild(tooltip);

    setTimeout(() => {
      tooltip.style.opacity = '0';
      setTimeout(() => tooltip.remove(), 300);
    }, 2000);
  }
  // ...rest of IIFE code...
})();
