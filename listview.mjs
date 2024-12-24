/// <reference path="./public.d.ts"/>
const defaultCreatePlaceholderRow=()=>{
  const el=document.createElement("div");
  el.textContent='placeholder';
  return el;
}
/** @type {ListModel} */
const EMPTY_LIST_MODEL={
  count:0,
  createPlaceholderRow(){
    throw new Error('unimplemented');
  },
  render(_placeholderRow,_index){
    throw new Error('unimplemented');
  }
};
const heightOf=(el,includeMargins=true)=>{
  const style=getComputedStyle(el);
  return parseFloat(style.height)+(includeMargins?parseFloat(style.marginTop)+parseFloat(style.marginBottom):0);
};
// const styles=await(await fetch(new URL('./listview.css',import.meta.url))).text();
const styles=`:host{position:relative;display:grid !important;overflow-x:hidden !important;padding:0 !important;border:0 !important;--scrollbar-width:17px}
.viewport{position:absolute;overflow-y:auto;scrollbar-gutter:stable}
.virtual.viewport{overflow-y:scroll;scrollbar-width:auto;inset:0 var(--scrollbar-width) 0 0;display:grid;grid-template-columns:1fr calc(var(--scrollbar-width) * 2);inset-inline-end:calc(var(--scrollbar-width) * -2)}
.virtual.viewport>:first-child{background:rgba(100,100,100,.3)}
.scaled.viewport{right:0;top:0;bottom:0;width:calc(var(--scrollbar-width) + 1px)}`;
export default class ListView extends HTMLElement{
  #model=EMPTY_LIST_MODEL;
  #rowHeight=0;
  #viewportHeight=0;
  #verticalScale=1;
  #virtualRowCount=0;
  #placeholderRows=[];
  #resizeObserver=new ResizeObserver(_entries=>{
    document.removeEventListener('keydown',this.#onKeyDown);
    this.#layout();
  });
  #simulatedScrollTop=0;
  #layoutRequestId=0;
  #renderRequestId=0;
  #onKeyDown;
  #onscroll=()=>{
    cancelAnimationFrame(this.#renderRequestId);
    this.#renderRequestId=requestAnimationFrame(()=>this.#render(false));
  };
  constructor(){
    super();
    const root=this.attachShadow({mode:'open'});
    const style=document.createElement('style');
    style.textContent=styles;
    root.appendChild(style);
/*
   <style>...</style>
   <div class="virtual viewport"> (grid) (scroll)
     <div style="margin-top: ?px">
       <slot name="virtual">
         ...light dom rows...
       </slot>
     </div>
     <div class="gutter"></div>
   </div>
   <div class="scaled viewport"> (scroll)
     <div style="height: ?px"></div>
   </div>
 */
    const scaledViewport=document.createElement('div');
    scaledViewport.classList.add('viewport');
    scaledViewport.classList.add('scaled');
    const scaledView=document.createElement('div');
    scaledViewport.appendChild(scaledView);
    const virtualViewport=document.createElement('div');
    virtualViewport.classList.add('viewport');
    virtualViewport.classList.add('virtual');
    const virtualView=document.createElement('div');
    const slot=document.createElement('slot');
    slot.name='virtual';
    virtualView.appendChild(slot);
    const gutter=document.createElement('div');
    virtualViewport.appendChild(virtualView);
    virtualViewport.appendChild(gutter);
    root.appendChild(virtualViewport);
    root.appendChild(scaledViewport);
    this.#onKeyDown=e=>{
      if(e.ctrlKey||e.metaKey){
        if(e.shiftKey) return;
        if(e.key==='Home'){
          e.preventDefault();
          virtualViewport.scrollTop=scaledViewport.scrollTop=0;
        }else if(e.key==='End'){
          e.preventDefault();
          scaledViewport.scrollTop=scaledViewport.scrollHeight;
        }
      }
      else if(!e.shiftKey){
        if(e.key==='PageDown'){
          e.preventDefault();
          const rowHeight=this.#rowHeight;
          virtualViewport.scrollTop+=Math.max(rowHeight,(virtualViewport.clientHeight-rowHeight));
        }else if(e.key==='PageUp'){
          e.preventDefault();
          const rowHeight=this.#rowHeight;
          virtualViewport.scrollTop-=Math.max(rowHeight,(virtualViewport.clientHeight-rowHeight));
        }
      }
    };
  }
  // noinspection JSUnusedGlobalSymbols
  connectedCallback(){
    this.#layout();
    setTimeout(()=>{if(this.isConnected) this.#resizeObserver.observe(this)},0);
  }
  // noinspection JSUnusedGlobalSymbols
  disconnectedCallback(){
    this.#resizeObserver.unobserve(this);
    document.removeEventListener('keydown',this.#onKeyDown);
  }
  set model(/** @type {ListModel} */ model){
    this.#model=model??EMPTY_LIST_MODEL;
    // clear placeholder rows from the latest model
    const placeholderRows=this.#placeholderRows;
    for(const it of placeholderRows.splice(0,placeholderRows.length)){
      it.remove();
    }
    if(this.isConnected){
      // reset scroll position to top and trigger layout
      const root=this.shadowRoot;
      const scaledViewport=root.querySelector('.scaled.viewport');
      const virtualViewport=root.querySelector('.virtual.viewport');
      const virtualView=virtualViewport.firstElementChild;
      scaledViewport.removeEventListener('scroll',this.#onscroll);
      virtualViewport.removeEventListener('scroll',this.#onscroll);
      virtualView.style.removeProperty('marginTop');
      this.#simulatedScrollTop=0;
      scaledViewport.scrollTop=0;
      document.removeEventListener('keydown',this.#onKeyDown);
      this.#layout();
    }
  }
  #layout(){
    // only layout once per animation frame
    clearInterval(this.#layoutRequestId);
    this.#layoutRequestId=setTimeout(()=>{
      const model=this.#model;
      const root=this.shadowRoot;
      const scaledViewport=root.querySelector('.scaled.viewport');
      const virtualViewport=root.querySelector('.virtual.viewport');
      const scaledView=scaledViewport.firstElementChild;
      const virtualView=scaledViewport.firstElementChild;
      const count=typeof model.count==='number'?model.count:model.count();
      if(count===0){
        this.#rowHeight=0;
        this.#viewportHeight=0;
        this.#virtualRowCount=0;
        this.#verticalScale=1;
        this.#simulatedScrollTop=0;
        virtualViewport.scrollTop=0;
        scaledView.style.setProperty('height','0px');
        return;
      }
      // get the row height from the first (virtual) row (in the light dom), which might not yet exist
      const rowHeight=this.#rowHeight=heightOf(this.#placeholderRows[0]??this.#addRow());
      const simulatedHeight=rowHeight*count;
      // dom element height is capped at different values on different browsers, we use 1 million px as a "safe" value
      // and scale the real view height beyond that number
      const verticalScale=this.#verticalScale=Math.max(1,Math.ceil(simulatedHeight/1_000_000));
      // deduce how many virtual rows we need from the viewport height
      const viewportHeight=this.#viewportHeight=heightOf(root.host,false);
      // +2 because the rows before and after might be partially visible
      // *3 because we want to render enough for page up and down
      const virtualRowCount=this.#virtualRowCount=Math.ceil(viewportHeight/rowHeight+2)*3;
      // console.debug(`count: ${count}, row: ${rowHeight}px, scale: ${verticalScale}`);
      // console.debug(`viewport: ${viewportHeight}px, virtual count: ${virtualRowCount}`);
      // add or remove virtual rows (in the light dom) to match the desired count
      const placeholderRows=this.#placeholderRows;
      while(placeholderRows.length<virtualRowCount) this.#addRow();
      while(placeholderRows.length>virtualRowCount) this.#removeRow();
      // update the scaled view height
      scaledView.style.setProperty('height',`${simulatedHeight/verticalScale+viewportHeight/verticalScale}px`);
      // index of the first visible row (not an integer if the first row is partially visible)
      let index=this.#simulatedScrollTop/rowHeight;
      // index of the first virtual row (we try to have 1/3 above and below)
      let k=index-virtualRowCount/3;
      // adjust if we are at/near the end (we don't want to go past the end)
      k=Math.min(k,count-virtualRowCount);
      // adjust if we are at/near the start
      k=Math.max(0,k);
      // decimal part is set as virtual margin
      const partialRowOffset=(k-Math.trunc(k))*rowHeight;
      virtualView.style.marginTop=`-${partialRowOffset}px`;
      // adjust virtual scroll top
      virtualViewport.scrollTop=(index-k)*rowHeight;
      // set css variable for the scrollbar width
      const scrollbarWidth=virtualViewport.offsetWidth-virtualViewport.clientWidth;
      if(scrollbarWidth>0) root.host.style.setProperty('--scrollbar-width',`${scrollbarWidth}px`);
      document.addEventListener('keydown',this.#onKeyDown,true);
      // layout is done, trigger a render
      this.#render(true);
    },0);
  }
  #render(_immediate){
    const root=this.shadowRoot;
    const scaledViewport=root.querySelector('.scaled.viewport');
    const virtualViewport=root.querySelector('.virtual.viewport');
    const virtualView=virtualViewport.firstElementChild;
    // we don't want to trigger the scroll events when we adjust the scroll positions in render
    scaledViewport.removeEventListener('scroll',this.#onscroll);
    virtualViewport.removeEventListener('scroll',this.#onscroll);
    const verticalScale=this.#verticalScale;
    const rowHeight=this.#rowHeight;
    const viewportHeight=this.#viewportHeight;
    const virtualRowCount=this.#virtualRowCount
    const model=this.#model;
    const count=typeof model.count==='number'?model.count:model.count();
    // simulated scroll top before adjustment due to scroll changes
    let simulatedScrollTop=this.#simulatedScrollTop;
    // index of the first visible row (not an integer if the first row is partially visible) before adjustment
    let index=simulatedScrollTop/rowHeight;
    // index of the first virtual row (we try to have 1/3 above and below) before adjustment
    let k=index-virtualRowCount/3;
    // adjust if we are at/near the end (we don't want to go past the end)
    k=Math.min(k,count-virtualRowCount);
    // adjust if we are at/near the start
    k=Math.max(0,k);
    // virtual view scroll top before adjustment
    let virtualScrollTop=(index-k)*rowHeight;
    // the scaled scroll should only trigger when interacted with the scrollbar directly
    // mouse wheel events and touch scrolls should be triggered on the virtual scroll
    // the simulated scroll position is computed from the combination of those two
    // scroll adjustment
    let verticalScrollAmount=0;
    // the scaled scroll top only participates if it has moved more than 1px
    let scaledScrollTop=Math.trunc(scaledViewport.scrollTop);
    if(Math.abs(scaledScrollTop-simulatedScrollTop/verticalScale)>1){
      verticalScrollAmount=scaledScrollTop*verticalScale-simulatedScrollTop;
    }
    verticalScrollAmount+=virtualViewport.scrollTop-virtualScrollTop;
    // include partial row offset
    let partialRowOffset=parseFloat(virtualView.style.getPropertyValue('marginTop')||0);
    verticalScrollAmount+=partialRowOffset;
    // update simulated scroll top
    simulatedScrollTop=this.#simulatedScrollTop=Math.max(
      0,Math.min(count*rowHeight-viewportHeight,simulatedScrollTop+verticalScrollAmount)
    );
    // update scaled scroll top if necessary
    scaledScrollTop=Math.trunc(simulatedScrollTop/verticalScale);
    if(scaledScrollTop!==scaledViewport.scrollTop){
      scaledViewport.scrollTop=scaledScrollTop;
    }
    // TODO we want to only update virtual scroll on idle or until bounds are reached, otherwise we cancel the native inertia
    index=simulatedScrollTop/rowHeight;
    k=index-virtualRowCount/3;
    k=Math.min(k,count-virtualRowCount);
    k=Math.max(0,k);
    // decimal part is set as margin
    partialRowOffset=(k-Math.trunc(k))*rowHeight;
    virtualView.style.marginTop=`-${partialRowOffset}px`;
    // update virtual scroll top if necessary
    virtualScrollTop=(index-k)*rowHeight;
    if(virtualScrollTop!==virtualViewport.scrollTop){
      virtualViewport.scrollTop=virtualScrollTop;
    }
    k=Math.trunc(k);
    // render the virtual rows
    const placeholderRows=this.#placeholderRows;
    for(const it of placeholderRows){
      if(++k>count){
        it.style.visibility='hidden';
      }else{
        it.style.removeProperty('visibility');
        model.render(it,k-1);
      }
    }
    // restore the scroll listeners
    scaledViewport.addEventListener('scroll',this.#onscroll);
    virtualViewport.addEventListener('scroll',this.#onscroll);
  }
  #addRow(){
    const createPlaceholderRow=this.#model.createPlaceholderRow;
    let placeholderRow=createPlaceholderRow?createPlaceholderRow():defaultCreatePlaceholderRow();
    if(placeholderRow instanceof DocumentFragment){
      const children=[...placeholderRow.children];
      if(children.length!==1) throw new Error('Placeholder cannot be a document fragment with multiple first level elements.');
      placeholderRow=children[0];
    }
    placeholderRow.style.visibility='hidden';
    placeholderRow.slot='virtual';
    this.#placeholderRows.push(placeholderRow);
    return this.appendChild(placeholderRow);
  }
  #removeRow(){
    this.#placeholderRows.pop().remove();
  }
}
customElements.define('list-view', ListView);
export {ListView};