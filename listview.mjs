/// <reference path="./public.d.ts"/>
/** @type {ListModel} */ const EMPTY_LIST_MODEL={
  count:0,
  createPlaceholderRow(){
    throw new Error('unimplemented');
  },
  render(placeholderRow,index){
    throw new Error('unimplemented');
  }
};
const heightOf=(el,includeMargins=true)=>{
  const style=getComputedStyle(el);
  return parseFloat(style.height)+(includeMargins?parseFloat(style.marginTop)+parseFloat(style.height):0);
};
const styles=await(await fetch(new URL('./listview.css',import.meta.url))).text();
export default class ListView extends HTMLElement{
  #model=EMPTY_LIST_MODEL;
  #count=0;
  #scale=1;
  #virtualCount=0;
  #rowHeight=0;
  #requestId=0;
  #placeholderRows=[];
  #resizeObserver=new ResizeObserver((function(entries){
    this.#layout();
  }).bind(this));
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
    const slot=document.createElement('slot');
    slot.name='virtual';
    const virtualView=document.createElement('div');
    virtualView.appendChild(slot);
    virtualViewport.appendChild(virtualView);
    root.appendChild(scaledViewport);
    root.appendChild(virtualViewport);
  }
  connectedCallback(){
    this.#layout();
    this.#resizeObserver.observe(this);
  }
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
    if(this.isConnected) this.#layout();
  }
  #layout(){
    cancelAnimationFrame(this.#requestId);
    requestAnimationFrame((function(){
      const count=this.#count;
      const root=this.shadowRoot;
      const scaledView=root.querySelector(".scaled.viewport>*");
      if(count===0){
        this.#rowHeight=0;
        this.#virtualCount=0;
        this.#scale=1;
        scaledView.style.height='0px';
        return;
      }
      const rowHeight=this.#rowHeight=count===0?0:heightOf(this.#placeholderRows[0]??this.#addRow());
      const simulatedHeight=rowHeight*count;
      // dom element height is capped at different values on different browsers, we use 1 million px as a *safe* value.
      const scale=this.#scale=Math.max(1,simulatedHeight/1_000_000);
      const viewportHeight=heightOf(root.host,false);
      // +2 because the rows before and after might be partially visible,
      // *3 because we want to preload enough for page up and down.
      const virtualCount=this.#virtualCount=Math.min(count,Math.ceil(viewportHeight/rowHeight+2)*3);
      const placeholderRows=this.#placeholderRows;
      while(placeholderRows.length<virtualCount) this.#addRow();
      while(placeholderRows.length>virtualCount) this.#removeRow();
      scaledView.style.height=`${simulatedHeight*scale}px`;
      this.#render();
    }).bind(this));
  }
  #render(){
    const root=this.shadowRoot;
    const scaledViewport=root.querySelector(".scaled.viewport");
    const scaledScrollTop=scaledViewport.scrollTop;
  }
  #addRow(){
    const placeholderRow=this.#model.createPlaceholderRow();
    this.#placeholderRows.push(placeholderRow);
    return this.appendChild(placeholderRow);
  }
  #removeRow(){
    this.#placeholderRows.pop().remove();
  }
}
customElements.define('list-view', ListView);
export {ListView};