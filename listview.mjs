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
const styles=await(await fetch(new URL('./listview.css',import.meta.url))).text();
export default class ListView extends HTMLElement{
  #model=EMPTY_LIST_MODEL;
  #rowHeight=0;
  #viewportHeight=0;
  #verticalScale=1;
  #virtualRowCount=0;
  #placeholderRows=[];
  #resizeObserver=new ResizeObserver((function(_entries){
    this.#layout();
  }).bind(this));
  #simulatedScrollTop=0;
  #layoutRequestId=0;
  #renderRequestId=0;
  #onscroll=(function(){
    cancelAnimationFrame(this.#renderRequestId);
    this.#renderRequestId=requestAnimationFrame(this.#render.bind(this));
  }).bind(this);
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
  }
  // noinspection JSUnusedGlobalSymbols
  connectedCallback(){
    this.#layout();
    setTimeout((function(){if(this.isConnected) this.#resizeObserver.observe(this)}).bind(this),0);
  }
  // noinspection JSUnusedGlobalSymbols
  disconnectedCallback(){
    this.#resizeObserver.unobserve(this);
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
      this.#simulatedScrollTop=0;
      scaledViewport.scrollTop=0;
      virtualView.style.marginTop='0px';
      this.#layout();
    }
  }
  #layout(){
    // only layout once per animation frame
    cancelAnimationFrame(this.#layoutRequestId);
    this.#layoutRequestId=requestAnimationFrame((function(){
      const model=this.#model;
      const root=this.shadowRoot;
      const scaledViewport=root.querySelector('.scaled.viewport');
      const virtualViewport=root.querySelector('.virtual.viewport');
      const scaledView=scaledViewport.firstElementChild;
      const virtualView=virtualViewport.firstElementChild;
      const count=typeof model.count==='number'?model.count:model.count();
      if(count===0){
        this.#rowHeight=0;
        this.#viewportHeight=0;
        this.#virtualRowCount=0;
        this.#verticalScale=1;
        this.#simulatedScrollTop=0;
        virtualViewport.scrollTop=0;
        scaledView.style.height='0px';
        return;
      }
      // get the row height from the first (virtual) row (in the light dom), which might not yet exist
      const rowHeight=this.#rowHeight=heightOf(this.#placeholderRows[0]??this.#addRow());
      const simulatedHeight=rowHeight*count;
      // dom element height is capped at different values on different browsers, we use 1 million px as a *safe* value
      // and scale the real view height beyond that number
      const verticalScale=this.#verticalScale=Math.max(1,simulatedHeight/1_000_000);
      // deduce how many virtual rows we need from the viewport height
      const viewportHeight=this.#viewportHeight=heightOf(root.host,false);
      // +2 because the rows before and after might be partially visible
      // *3 because we want to preload enough for page up and down
      const virtualRowCount=this.#virtualRowCount=Math.ceil(viewportHeight/rowHeight+2)*3;
      console.log(
        `viewport: ${viewportHeight}px, row: ${rowHeight}px, virtual count: ${virtualRowCount}, scale: ${verticalScale}`
      );
      // add or remove virtual rows (in the light dom) to match the desired count
      const placeholderRows=this.#placeholderRows;
      while(placeholderRows.length<virtualRowCount) this.#addRow();
      while(placeholderRows.length>virtualRowCount) this.#removeRow();
      // update the scaled view height
      scaledView.style.height=`${simulatedHeight*verticalScale}px`;
      // number of virtual rows above the first (partially) visible row
      const n=virtualRowCount/3;
      // set css variable for the scrollbar width
      const scrollbarWidth=virtualViewport.offsetWidth-virtualViewport.clientWidth;
      root.host.style.setProperty('--scrollbar-width',`${scrollbarWidth}px`);
      // set initial virtual view offset
      const offset=-parseFloat(virtualView.style.marginTop)||0;
      virtualViewport.scrollTop=n*rowHeight+offset;
      // layout is done, trigger a render
      this.#render();
    }).bind(this));
  }
  #render(){
    const root=this.shadowRoot;
    const scaledViewport=root.querySelector('.scaled.viewport');
    const virtualViewport=root.querySelector('.virtual.viewport');
    const scaledView=scaledViewport.firstElementChild;
    const virtualView=virtualViewport.firstElementChild;
    // we don't want to trigger the scroll events when we adjust the scroll positions in render
    scaledViewport.removeEventListener('scroll',this.#onscroll);
    virtualViewport.removeEventListener('scroll',this.#onscroll);
    // number of virtual rows above the first (partially) visible row
    const n=this.#virtualRowCount/3;
    const rowHeight=this.#rowHeight;
    // the scaled scroll should only trigger when interacted with the scrollbar directly
    // mouse wheel events and touch scrolls should be triggered on the virtual scroll
    // the virtual scroll position is computed from the combination of those two
    const virtualScrollTop=virtualViewport.scrollTop-n*rowHeight;
    let scaledScrollTop=scaledViewport.scrollTop;
    const verticalScale=this.#verticalScale;
    let simulatedScrollTop=this.#simulatedScrollTop;
    let offset=-parseFloat(scaledView.style.marginTop)||0;
    // the scaled scroll top only participates if it has moved more than 1px
    if(Math.abs(scaledScrollTop-this.#simulatedScrollTop/verticalScale)<1){
      simulatedScrollTop+=virtualScrollTop-offset;
    }else{
      simulatedScrollTop=scaledScrollTop*verticalScale+virtualScrollTop-offset;
    }
    console.log(`scrollTop: scaled=${scaledScrollTop}px, virtual=${virtualScrollTop}px, simulated=${simulatedScrollTop}px`);
    const model=this.#model;
    const count=typeof model.count==='number'?model.count:model.count();
    const viewportHeight=this.#viewportHeight;
    // we want the max scroll top to be when the last row is at the end of the viewport and not at the top
    this.#simulatedScrollTop=simulatedScrollTop=Math.min(count*rowHeight-viewportHeight,simulatedScrollTop);
    // index of the first (partially) visible row
    let index=Math.trunc(simulatedScrollTop/rowHeight);
    // offset of the first row (from 0 if the first row is completely visible to rowHeight if it's completely hidden)
    offset=simulatedScrollTop%rowHeight;
    console.log(
      `simulated scrollTop: ${simulatedScrollTop}px, index: ${simulatedScrollTop/rowHeight}, offset: ${offset}px`
    );
    // reset the virtual scroll position
    virtualViewport.scrollTop=n*rowHeight+offset;
    // update the scaled scroll position
    scaledViewport.scrollTop=/*Math.trunc(*/simulatedScrollTop/verticalScale-offset/*)*/;
    // update the virtual view margin
    virtualView.style.marginTop=`${-offset}px`;
    // render the virtual rows
    const placeholderRows=this.#placeholderRows;
    index-=n;
    for(const it of placeholderRows){
      // if we are near the start, there might be indices below 0 that need to be skipped
      // and if we are near the end, there might be indices after the end that need to be skipped as well
      if(index++<0||index>count) continue;
      model.render(it,index-1);
    }
    // restore the scroll listeners
    setTimeout((function(){
      if(this.isConnected){
        scaledViewport.addEventListener('scroll',this.#onscroll);
        virtualViewport.addEventListener('scroll',this.#onscroll);
      }
    }).bind(this),0);
  }
  #addRow(){
    const createPlaceholderRow=this.#model.createPlaceholderRow;
    let placeholderRow=createPlaceholderRow?createPlaceholderRow():defaultCreatePlaceholderRow();
    if(placeholderRow instanceof DocumentFragment){
      const children=[...placeholderRow.children];
      if(children.length!==1) throw new Error('Placeholder cannot be a document fragment with multiple first level elements.');
      placeholderRow=children[0];
    }
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