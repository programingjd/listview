const defaultCreatePlaceholderRow=()=>{const f=document.createElement("div");f.textContent="placeholder";return f},EMPTY_LIST_MODEL={count:0,createPlaceholderRow(){throw new Error("unimplemented")},render(f,g){throw new Error("unimplemented")}},heightOf=(f,g=!0)=>{const h=getComputedStyle(f);return parseFloat(h.height)+(g?parseFloat(h.marginTop)+parseFloat(h.marginBottom):0)},styles=await (await fetch(new URL("./listview.css",import.meta.url))).text();var ListView=class extends HTMLElement{#model=EMPTY_LIST_MODEL;#rowHeight=0;#viewportHeight=0;#verticalScale=1;#virtualRowCount=0;#placeholderRows=[];#resizeObserver=new ResizeObserver((f)=>{document.removeEventListener("keydown",this.#onKeyDown),this.#layout()});#simulatedScrollTop=0;#layoutRequestId=0;#renderRequestId=0;#onKeyDown;#onscroll=()=>{cancelAnimationFrame(this.#renderRequestId),this.#renderRequestId=requestAnimationFrame(()=>this.#render(!1))};constructor(){super();const f=this.attachShadow({mode:"open"}),g=document.createElement("style");g.textContent=styles;f.appendChild(g);const h=document.createElement("div");h.classList.add("viewport");h.classList.add("scaled");const i=document.createElement("div");h.appendChild(i);const j=document.createElement("div");j.classList.add("viewport");j.classList.add("virtual");const k=document.createElement("div"),l=document.createElement("slot");l.name="virtual";k.appendChild(l);const m=document.createElement("div");j.appendChild(k);j.appendChild(m);f.appendChild(j);f.appendChild(h);this.#onKeyDown=(n)=>{if(n.ctrlKey||n.metaKey){if(n.shiftKey)return;if(n.key==="Home")n.preventDefault(),j.scrollTop=h.scrollTop=0;else if(n.key==="End")n.preventDefault(),h.scrollTop=h.scrollHeight}else if(!n.shiftKey){if(n.key==="PageDown"){n.preventDefault();const o=this.#rowHeight;j.scrollTop+=Math.max(o,j.clientHeight-o)}else if(n.key==="PageUp"){n.preventDefault();const o=this.#rowHeight;j.scrollTop-=Math.max(o,j.clientHeight-o)}}}}connectedCallback(){this.#layout(),setTimeout(()=>{if(this.isConnected)this.#resizeObserver.observe(this)},0)}disconnectedCallback(){this.#resizeObserver.unobserve(this),document.removeEventListener("keydown",this.#onKeyDown)}set model(f){this.#model=f??EMPTY_LIST_MODEL;const g=this.#placeholderRows;for(const h of g.splice(0,g.length))h.remove();if(this.isConnected){const h=this.shadowRoot,i=h.querySelector(".scaled.viewport"),j=h.querySelector(".virtual.viewport"),k=j.firstElementChild;i.removeEventListener("scroll",this.#onscroll);j.removeEventListener("scroll",this.#onscroll);k.style.removeProperty("marginTop");this.#simulatedScrollTop=0;i.scrollTop=0;document.removeEventListener("keydown",this.#onKeyDown);this.#layout()}}#layout(){clearInterval(this.#layoutRequestId),this.#layoutRequestId=setTimeout(()=>{const f=this.#model,g=this.shadowRoot,h=g.querySelector(".scaled.viewport"),i=g.querySelector(".virtual.viewport"),j=h.firstElementChild,k=h.firstElementChild,l=typeof f.count==="number"?f.count:f.count();if(l===0){this.#rowHeight=0;this.#viewportHeight=0;this.#virtualRowCount=0;this.#verticalScale=1;this.#simulatedScrollTop=0;i.scrollTop=0;j.style.setProperty("height","0px");return}const m=this.#rowHeight=heightOf(this.#placeholderRows[0]??this.#addRow()),n=m*l,o=this.#verticalScale=Math.max(1,Math.ceil(n/1e6)),p=this.#viewportHeight=heightOf(g.host,!1),q=this.#virtualRowCount=Math.ceil(p/m+2)*3,r=this.#placeholderRows;while(r.length<q)this.#addRow();while(r.length>q)this.#removeRow();j.style.setProperty("height",`${n/o+p/o}px`);let s=this.#simulatedScrollTop/m,t=s-q/3;t=Math.min(t,l-q);t=Math.max(0,t);const u=(t-Math.trunc(t))*m;k.style.marginTop=`-${u}px`;i.scrollTop=(s-t)*m;const v=i.offsetWidth-i.clientWidth;g.host.style.setProperty("--scrollbar-width",`${v}px`);document.addEventListener("keydown",this.#onKeyDown,!0);this.#render(!0)},0)}#render(f){const g=this.shadowRoot,h=g.querySelector(".scaled.viewport"),i=g.querySelector(".virtual.viewport"),j=i.firstElementChild;h.removeEventListener("scroll",this.#onscroll);i.removeEventListener("scroll",this.#onscroll);const k=this.#verticalScale,l=this.#rowHeight,m=this.#viewportHeight,n=this.#virtualRowCount,o=this.#model,p=typeof o.count==="number"?o.count:o.count();let q=this.#simulatedScrollTop,r=q/l,s=r-n/3;s=Math.min(s,p-n);s=Math.max(0,s);let t=(r-s)*l,u=0,v=Math.trunc(h.scrollTop);if(Math.abs(v-q/k)>1)u=v*k-q;u+=i.scrollTop-t;let w=parseFloat(j.style.getPropertyValue("marginTop")||0);u+=w;q=this.#simulatedScrollTop=Math.max(0,Math.min(p*l-m,q+u));v=Math.trunc(q/k);if(v!==h.scrollTop)h.scrollTop=v;r=q/l;s=r-n/3;s=Math.min(s,p-n);s=Math.max(0,s);w=(s-Math.trunc(s))*l;j.style.marginTop=`-${w}px`;t=(r-s)*l;if(t!==i.scrollTop)i.scrollTop=t;s=Math.trunc(s);const x=this.#placeholderRows;for(const y of x)if(++s>p)y.style.visibility="hidden";else y.style.removeProperty("visibility"),o.render(y,s-1);h.addEventListener("scroll",this.#onscroll);i.addEventListener("scroll",this.#onscroll)}#addRow(){const f=this.#model.createPlaceholderRow;let g=f?f():defaultCreatePlaceholderRow();if(g instanceof DocumentFragment){const h=[...g.children];if(h.length!==1)throw new Error("Placeholder cannot be a document fragment with multiple first level elements.");g=h[0]}g.style.visibility="hidden";g.slot="virtual";this.#placeholderRows.push(g);return this.appendChild(g)}#removeRow(){this.#placeholderRows.pop().remove()}};customElements.define("list-view",ListView);export {ListView,ListView as default};
//# sourceMappingURL=listview.js.map