/// <reference path="./public.d.ts"/>
/** @type {ListModel} */ const EMPTY_LIST_MODEL={
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
  #count=0;
  #scale=1;
  #virtualCount=0;
  #rowHeight=0;
  #viewportHeight=0;
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
    const side=document.createElement('div');
    virtualViewport.appendChild(virtualView);
    virtualViewport.appendChild(side);
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
    this.#model=model;
    this.#count=model?.count??0;
    const placeholderRows=this.#placeholderRows;
    for(const it of placeholderRows.splice(0,placeholderRows.length)){
      it.remove();
    }
    if(this.isConnected){
      const root=this.shadowRoot;
      const scaledViewport=root.querySelector('.scaled.viewport');
      const virtualViewport=root.querySelector('.virtual.viewport');
      scaledViewport.removeEventListener('scroll',this.#onscroll);
      virtualViewport.removeEventListener('scroll',this.#onscroll);
      this.#simulatedScrollTop=0;
      scaledViewport.scrollTop=0;
      virtualViewport.scrollTop=0;
      this.#layout();
    }
  }
  #layout(){
    cancelAnimationFrame(this.#layoutRequestId);
    this.#layoutRequestId=requestAnimationFrame((function(){
      const count=this.#count;
      const root=this.shadowRoot;
      const scaledView=root.querySelector('.scaled.viewport>*');
      const virtualView=root.querySelector('.virtual.viewport>*');
      if(count===0){
        this.#rowHeight=0;
        this.#viewportHeight=0;
        this.#virtualCount=0;
        this.#scale=1;
        this.#simulatedScrollTop=0;
        scaledView.style.height='0px';
        virtualView.style.marginTop='0px';
        return;
      }
      const rowHeight=this.#rowHeight=count===0?0:heightOf(this.#placeholderRows[0]??this.#addRow());
      const simulatedHeight=rowHeight*count;
      // dom element height is capped at different values on different browsers, we use 1 million px as a *safe* value.
      const scale=this.#scale=Math.max(1,simulatedHeight/1_000_000);
      const viewportHeight=this.#viewportHeight=heightOf(root.host,false);
      // +2 because the rows before and after might be partially visible,
      // *3 because we want to preload enough for page up and down.
      const virtualCount=this.#virtualCount=Math.ceil(viewportHeight/rowHeight+2)*3;
      console.log(`viewport height: ${viewportHeight}, row height: ${rowHeight}, virtual count: ${virtualCount}, scale: ${scale}`);
      const placeholderRows=this.#placeholderRows;
      while(placeholderRows.length<virtualCount) this.#addRow();
      while(placeholderRows.length>virtualCount) this.#removeRow();
      scaledView.style.height=`${simulatedHeight*scale}px`;
      const virtualViewport=root.querySelector('.virtual.viewport');
      const scrollbarWidth=virtualViewport.offsetWidth-virtualViewport.clientWidth;
      root.host.style.setProperty('--scrollbar-width',`${scrollbarWidth}px`);
      this.#render();
    }).bind(this));
  }
  #render(){
    const root=this.shadowRoot;
    const scaledViewport=root.querySelector('.scaled.viewport');
    const virtualViewport=root.querySelector('.virtual.viewport');
    scaledViewport.removeEventListener('scroll',this.#onscroll);
    virtualViewport.removeEventListener('scroll',this.#onscroll);
    const virtualScrollTop=virtualViewport.scrollTop;
    let scaledScrollTop=scaledViewport.scrollTop;
    const scale=this.#scale;
    let simulatedScrollTop=this.#simulatedScrollTop;
    if(Math.abs(scaledScrollTop-this.#simulatedScrollTop/scale)<1){
      simulatedScrollTop+=virtualScrollTop;
    }else{
      simulatedScrollTop=scaledScrollTop*scale+virtualScrollTop;
    }
    const count=this.#count;
    const rowHeight=this.#rowHeight;
    const viewportHeight=this.#viewportHeight;
    this.#simulatedScrollTop=simulatedScrollTop=Math.min(count*rowHeight-viewportHeight,simulatedScrollTop);
    virtualViewport.scrollTop=0;
    scaledViewport.scrollTop=Math.trunc(simulatedScrollTop/scale);

    const n=this.#virtualCount/3;
    let index=Math.trunc(simulatedScrollTop/rowHeight)-n;
    let offset=simulatedScrollTop%rowHeight-n*rowHeight;
    console.log(`scrollTop: ${simulatedScrollTop}, index: ${simulatedScrollTop/rowHeight}, offset: ${offset}`);
    const virtualView=root.querySelector('.virtual>*');
    virtualView.style.marginTop=`${offset}px`;
    const placeholderRows=this.#placeholderRows;
    const model=this.#model;
    for(const it of placeholderRows){
      if(index++<0||index>count) continue;
      model.render(it,index-1);
    }
    setTimeout((function(){
      if(this.isConnected){
        scaledViewport.addEventListener('scroll',this.#onscroll);
        virtualViewport.addEventListener('scroll',this.#onscroll);
      }
    }).bind(this),0);
  }
  #addRow(){
    let placeholderRow=this.#model.createPlaceholderRow();
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