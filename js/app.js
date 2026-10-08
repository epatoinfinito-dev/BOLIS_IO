/* =========================================================
   BolisIO · app.js
   Datos (localStorage), reglas de negocio y render de módulos.
   Sin dependencias externas. Código en español.
   ========================================================= */

/* ---------- Utilidades ---------- */
const CLAVE = 'bolisio:datos:v1';           // Cambiar la versión solo si cambia la estructura de datos
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const COP = n => new Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0}).format(n);
const hoy = () => new Date();
const ahora = () => new Date().toISOString();
const fechaCorta = iso => new Date(iso).toLocaleDateString('es-CO', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const siguienteId = lista => Math.max(0, ...lista.map(x => x.id)) + 1;
const reducirMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Datos iniciales ---------- */
// Precios y costos de ejemplo: edítalos en Inventario antes de usar la app.
function semilla(){
  const base = [
    ['Maracuyá',  '🟠', '#f2542d', 2500, 900 ],
    ['Corozo',    '🟣', '#8e3b8f', 2500, 950 ],
    ['Mango',     '🥭', '#ffa41b', 2500, 900 ],
    ['Piña',      '🍍', '#f5c918', 2000, 700 ],
    ['Lulo con leche','🟢','#6fb536',3000,1300],
    ['Galleta',   '🍪', '#c98a4b', 3000, 1200],
    ['Coco',      '🥥', '#b9a48a', 2500, 1000],
    ['Chocolate', '🍫', '#5a3322', 3000, 1100]
  ];
  return {
    productos: base.map(([nombre, emoji, color, precio, costo], i) => ({id:i+1, nombre, emoji, color, precio, costo, stock:0})),
    clientes: [],
    ventas: [],
    movimientos: []
  };
}

/* ---------- Persistencia ---------- */
function cargar(){
  try{
    const raw = localStorage.getItem(CLAVE);
    if(raw){
      const d = JSON.parse(raw);
      if(d && Array.isArray(d.productos)) return d;
    }
  }catch(e){ console.warn('Datos no legibles, se usan los iniciales.', e); }
  return semilla();
}
let datos = cargar();

function guardar(){
  try{ localStorage.setItem(CLAVE, JSON.stringify(datos)); }
  catch(e){ aviso('No se pudo guardar en este navegador. Descarga un respaldo en Exportar.', true); }
}

/* ---------- Consultas y reglas de negocio ---------- */
const prod = id => datos.productos.find(p => p.id === id);
const cli  = id => datos.clientes.find(c => c.id === id);
const fiadoDe  = id => datos.ventas.filter(v => v.pago === 'fiao' && v.clienteId === id).reduce((a,v) => a + v.total, 0);
const abonosDe = c => c.abonos.reduce((a,x) => a + x.monto, 0);
const saldo    = c => fiadoDe(c.id) - abonosDe(c);          // Sin intereses: compras fiadas − abonos
const cartera  = () => datos.clientes.reduce((a,c) => a + Math.max(0, saldo(c)), 0);

function enPeriodo(iso, per){
  if(per === 'todo') return true;
  const f = new Date(iso), n = hoy();
  if(per === 'dia') return f.toDateString() === n.toDateString();
  if(per === 'semana') return (n - f) / 86400000 <= 7;
  return f.getMonth() === n.getMonth() && f.getFullYear() === n.getFullYear(); // mes
}

/* ---------- Avisos y animaciones ---------- */
let tAviso;
function aviso(txt, error = false){
  const el = $('#aviso');
  el.textContent = txt;
  el.classList.toggle('error', error);
  el.classList.add('on');
  clearTimeout(tAviso);
  tAviso = setTimeout(() => el.classList.remove('on'), 2000);
}
function celebrar(txt){
  $('#ovlTxt').textContent = txt;
  $('#ovl').classList.add('on');
  setTimeout(() => $('#ovl').classList.remove('on'), 1500);
}
function animarNumero(el, hasta, fmt = x => x.toLocaleString('es-CO')){
  const desde = Number(el.dataset.v || 0);
  el.dataset.v = hasta;
  if(reducirMovimiento()){ el.textContent = fmt(hasta); return; }
  const t0 = performance.now(), dur = 900;
  const paso = t => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(desde + (hasta - desde) * e));
    if(k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}
const dibujarBarras = svg => {
  svg.classList.remove('anim');
  requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('anim')));
};

/* ---------- Navegación ---------- */
const VISTAS = {
  ventas: renderVentas, clientes: renderClientes, inventario: renderInventario,
  rentabilidad: renderRentabilidad, estadisticas: renderEstadisticas, exportar: () => {}
};
function irA(v){
  $$('nav.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.v === v ? 'page' : 'false'));
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  VISTAS[v]?.();
  window.scrollTo({top:0, behavior: reducirMovimiento() ? 'auto' : 'smooth'});
}
$$('nav.tabs button').forEach(b => b.addEventListener('click', () => irA(b.dataset.v)));

/* =========================================================
   VENTAS
   ========================================================= */
const carrito = {};        // {idProducto: cantidad}
let pagoSel = 'efectivo';

function renderVentas(){
  $('#fechaHoy').textContent = hoy().toLocaleDateString('es-CO', {weekday:'long', day:'numeric', month:'long'});
  const g = $('#grid');
  g.innerHTML = '';
  datos.productos.forEach(p => {
    const b = document.createElement('button');
    b.className = 'prod';
    b.type = 'button';
    b.disabled = p.stock <= 0;
    b.setAttribute('aria-label', `${p.nombre}, ${COP(p.precio)}, stock ${p.stock}`);
    b.innerHTML = `
      ${p.stock <= 0 ? '<span class="badge">Agotado</span>' : ''}
      <span class="bolis" aria-hidden="true">${esc(p.emoji) || '🍧'}</span>
      <span class="nom">${esc(p.nombre)}</span>
      <span class="meta">${COP(p.precio)} · ${p.stock} disp.</span>`;
    b.addEventListener('click', () => agregarAlCarrito(p.id, b));
    g.appendChild(b);
  });
  const nuevo = document.createElement('button');
  nuevo.className = 'prod nuevo';
  nuevo.type = 'button';
  nuevo.innerHTML = '<span class="bolis" aria-hidden="true">＋</span><span class="nom">Nuevo producto (en blanco)</span>';
  nuevo.addEventListener('click', () => abrirProducto());
  g.appendChild(nuevo);
  renderCarrito();
  renderListaVentas();
}

function agregarAlCarrito(id, btn){
  const p = prod(id);
  const actual = carrito[id] || 0;
  if(actual >= p.stock){
    btn.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'none'}], {duration:300});
    aviso(`Solo quedan ${p.stock} de ${p.nombre}.`, true);
    return;
  }
  carrito[id] = actual + 1;
  btn.classList.remove('salta'); void btn.offsetWidth; btn.classList.add('salta');
  renderCarrito();
}

function renderCarrito(){
  const cont = $('#lineas');
  cont.innerHTML = '';
  const ids = Object.keys(carrito).map(Number).filter(i => carrito[i] > 0);
  $('#vacio').hidden = ids.length > 0;
  let total = 0;
  ids.forEach(id => {
    const p = prod(id), q = carrito[id];
    total += p.precio * q;
    const d = document.createElement('div');
    d.className = 'linea';
    d.innerHTML = `
      <div><strong>${esc(p.emoji)} ${esc(p.nombre)}</strong><div class="muted">${COP(p.precio)} c/u</div></div>
      <div class="qty">
        <button class="sec" type="button" aria-label="Quitar uno de ${esc(p.nombre)}" data-m="-1">−</button>
        <span class="money">${q}</span>
        <button class="sec" type="button" aria-label="Agregar uno de ${esc(p.nombre)}" data-m="1">+</button>
      </div>`;
    d.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const nuevo = q + Number(b.dataset.m);
      if(nuevo <= 0) delete carrito[id];
      else if(nuevo <= p.stock) carrito[id] = nuevo;
      else { aviso(`Solo quedan ${p.stock} de ${p.nombre}.`, true); return; }
      renderVentas();
    }));
    cont.appendChild(d);
  });
  animarNumero($('#total'), total, COP);
  $('#labelCliente').hidden = pagoSel !== 'fiao';
  llenarSelectClientes();
  validarVenta();
}

function llenarSelectClientes(){
  const sel = $('#selCliente');
  const actual = sel.value;
  sel.innerHTML = '<option value="">— Elige un cliente —</option>' +
    datos.clientes.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  if(actual && cli(Number(actual))) sel.value = actual;
}

function validarVenta(){
  const hayItems = Object.values(carrito).some(q => q > 0);
  let msg = '';
  if(!hayItems) msg = 'Agrega al menos un bolis.';
  else if(pagoSel === 'fiao' && !$('#selCliente').value) msg = 'El fiao debe asociarse a un cliente.';
  $('#errVenta').textContent = msg;
  $('#cobrar').disabled = !!msg;
  return !msg;
}

$$('[data-pago]').forEach(b => b.addEventListener('click', () => {
  pagoSel = b.dataset.pago;
  $$('[data-pago]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  renderCarrito();
}));
$('#selCliente').addEventListener('change', validarVenta);

$('#cobrar').addEventListener('click', () => {
  if(!validarVenta()) return;
  const items = Object.keys(carrito).map(Number).filter(id => carrito[id] > 0).map(id => {
    const p = prod(id);
    return {id, cant: carrito[id], precio: p.precio, costo: p.costo};
  });
  const total = items.reduce((a,i) => a + i.precio * i.cant, 0);
  const clienteId = pagoSel === 'fiao' ? Number($('#selCliente').value) : null;

  items.forEach(i => { prod(i.id).stock -= i.cant; });
  datos.ventas.push({id: siguienteId(datos.ventas), fecha: ahora(), items, total, pago: pagoSel, clienteId});
  guardar();
  for(const k of Object.keys(carrito)) delete carrito[k];
  $('#selCliente').value = '';
  celebrar(`${COP(total)} · ${pagoSel}`);
  renderVentas();
});

/* ---------- Ventas recientes: editar y anular ---------- */
function renderListaVentas(){
  const cont = $('#listaVentas');
  const recientes = [...datos.ventas].sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 10);
  cont.innerHTML = recientes.length ? recientes.map(v => {
    const nombreCli = v.clienteId ? (cli(v.clienteId)?.nombre || 'Cliente eliminado') : 'Sin cliente';
    const bolis = v.items.reduce((a,i) => a + i.cant, 0);
    return `
      <div class="card item">
        <div class="info">
          <strong>${fechaCorta(v.fecha)} · ${bolis} bolis · ${v.pago}</strong>
          <span class="muted">${esc(nombreCli)}</span>
        </div>
        <div class="qty">
          <span class="money">${COP(v.total)}</span>
          <button class="sec" type="button" data-editar="${v.id}">Editar</button>
          <button class="sec" type="button" data-anular="${v.id}">Anular</button>
        </div>
      </div>`;
  }).join('') : '<p class="muted">Aún no hay ventas registradas.</p>';
  cont.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => abrirEditarVenta(Number(b.dataset.editar))));
  cont.querySelectorAll('[data-anular]').forEach(b => b.addEventListener('click', () => anularVenta(Number(b.dataset.anular))));
}

function anularVenta(id){
  const v = datos.ventas.find(x => x.id === id);
  if(!v) return;
  if(!confirm(`¿Anular la venta de ${COP(v.total)}? El stock se devuelve y el saldo fiado se ajusta.`)) return;
  v.items.forEach(i => { prod(i.id).stock += i.cant; });
  datos.ventas = datos.ventas.filter(x => x.id !== id);
  guardar();
  renderVentas(); renderClientes(); renderInventario();
  aviso('Venta anulada');
}

let ventaEditId = null;
function abrirEditarVenta(id){
  const v = datos.ventas.find(x => x.id === id);
  if(!v) return;
  ventaEditId = id;
  $('#eTitulo').textContent = `Editar venta · ${fechaCorta(v.fecha)}`;
  $('#eItems').innerHTML = v.items.map(i => {
    const p = prod(i.id);
    return `<div class="linea">
      <span>${esc(p?.emoji)} ${esc(p?.nombre)}</span>
      <input type="number" min="0" step="1" value="${i.cant}" data-item="${i.id}" aria-label="Cantidad de ${esc(p?.nombre)}" style="width:90px">
    </div>`;
  }).join('');
  $('#ePago').value = v.pago;
  $('#eCliente').innerHTML = '<option value="">— Sin cliente —</option>' +
    datos.clientes.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  $('#eCliente').value = v.clienteId || '';
  $('#eErr').textContent = '';
  $('#dlgEditar').showModal();
}

function guardarEdicionVenta(){
  const v = datos.ventas.find(x => x.id === ventaEditId);
  if(!v) return;
  const nuevos = $$('#eItems input').map(inp => ({id: Number(inp.dataset.item), cant: Math.trunc(Number(inp.value))}));
  const pagoN = $('#ePago').value;
  const clienteN = $('#eCliente').value ? Number($('#eCliente').value) : null;
  const err = $('#eErr');

  if(nuevos.some(n => !(n.cant >= 0))) return err.textContent = 'Las cantidades no pueden ser negativas.';
  if(nuevos.every(n => n.cant === 0)) return err.textContent = 'La venta debe tener al menos un bolis. Para eliminarla, usa Anular.';
  if(pagoN === 'fiao' && !clienteN) return err.textContent = 'El fiao debe asociarse a un cliente.';

  // 1. Devolver el stock de la venta original
  v.items.forEach(i => { prod(i.id).stock += i.cant; });
  // 2. Validar contra el stock disponible; si falla, deshacer
  const sinStock = nuevos.find(n => n.cant > prod(n.id).stock);
  if(sinStock){
    v.items.forEach(i => { prod(i.id).stock -= i.cant; });
    return err.textContent = `Stock insuficiente de ${prod(sinStock.id).nombre}.`;
  }
  // 3. Aplicar, conservando el precio y costo originales de cada línea
  v.items = nuevos.filter(n => n.cant > 0).map(n => {
    const orig = v.items.find(i => i.id === n.id);
    const p = prod(n.id);
    return {id: n.id, cant: n.cant, precio: orig ? orig.precio : p.precio, costo: orig ? orig.costo : p.costo};
  });
  v.items.forEach(i => { prod(i.id).stock -= i.cant; });
  v.total = v.items.reduce((a,i) => a + i.precio * i.cant, 0);
  v.pago = pagoN;
  v.clienteId = clienteN;
  guardar();
  $('#dlgEditar').close();
  renderVentas(); renderClientes(); renderInventario();
  aviso('Venta actualizada');
}
$('#eCancel').addEventListener('click', () => $('#dlgEditar').close());
$('#eGuardar').addEventListener('click', guardarEdicionVenta);

/* =========================================================
   CLIENTES
   ========================================================= */
let clienteEditId = null;

function renderClientes(){
  const cont = $('#listaClientes');
  if(!datos.clientes.length){
    cont.innerHTML = '<p class="muted">Aún no tienes clientes. Crea el primero con el botón de arriba.</p>';
    return;
  }
  cont.innerHTML = datos.clientes.map(c => {
    const s = saldo(c);
    const nCompras = datos.ventas.filter(v => v.clienteId === c.id).length;
    return `
      <article class="card" data-cli="${c.id}">
        <div class="item">
          <div class="info">
            <strong style="font-size:1.1rem">${esc(c.nombre)}</strong>
            <span class="muted">${esc(c.tel) || 'Sin teléfono'} · ${nCompras} compras${c.notas ? ' · ' + esc(c.notas) : ''}</span>
            <span>Saldo fiado: <span class="money ${s > 0 ? 'bajo-txt' : ''}">${COP(s)}</span></span>
          </div>
          <div class="qty">
            <button class="sec" type="button" data-accion="historial">Historial</button>
            <button class="sec" type="button" data-accion="editar">Editar</button>
            <button class="sec" type="button" data-accion="eliminar">Eliminar</button>
          </div>
        </div>
        <form class="qty abono-form">
          <input type="number" min="1" step="1" placeholder="Monto del abono" aria-label="Monto del abono para ${esc(c.nombre)}">
          <button type="submit" class="sec">Registrar abono</button>
        </form>
        <div class="historial" hidden></div>
      </article>`;
  }).join('');
}

$('#listaClientes').addEventListener('click', e => {
  const card = e.target.closest('[data-cli]');
  const accion = e.target.dataset.accion;
  if(!card || !accion) return;
  const c = cli(Number(card.dataset.cli));
  if(accion === 'historial') return mostrarHistorial(card, c);
  if(accion === 'editar') return abrirCliente(c);
  if(accion === 'eliminar') return eliminarCliente(c);
});

$('#listaClientes').addEventListener('submit', e => {
  e.preventDefault();
  const card = e.target.closest('[data-cli]');
  const c = cli(Number(card.dataset.cli));
  const monto = Math.trunc(Number(e.target.querySelector('input').value));
  const s = saldo(c);
  if(!(monto > 0)) return aviso('El abono debe ser mayor a cero.', true);
  if(monto > s) return aviso(`El abono no puede superar el saldo pendiente (${COP(s)}).`, true);
  c.abonos.push({monto, fecha: ahora()});
  guardar();
  renderClientes();
  aviso(`Abono de ${COP(monto)} registrado`);
});

function mostrarHistorial(card, c){
  const box = card.querySelector('.historial');
  if(!box.hidden){ box.hidden = true; return; }
  const compras = datos.ventas.filter(v => v.clienteId === c.id)
    .map(v => ({fecha: v.fecha, texto: `Compra · ${v.pago}`, monto: `${COP(v.total)}`}));
  const abonos = c.abonos.map(a => ({fecha: a.fecha, texto: 'Abono', monto: `−${COP(a.monto)}`}));
  const todo = [...compras, ...abonos].sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
  box.innerHTML = todo.length
    ? todo.map(m => `<div class="linea"><span>${m.texto} · ${fechaCorta(m.fecha)}</span><span class="money">${m.monto}</span></div>`).join('')
    : '<p class="muted">Sin movimientos todavía.</p>';
  box.hidden = false;
}

function abrirCliente(c){
  clienteEditId = c?.id ?? null;
  $('#tCli').textContent = c ? `Editar ${c.nombre}` : 'Nuevo cliente';
  $('#cNombre').value = c?.nombre ?? '';
  $('#cTel').value = c?.tel ?? '';
  $('#cNotas').value = c?.notas ?? '';
  $('#errCli').textContent = '';
  $('#dlgCliente').showModal();
}

function eliminarCliente(c){
  if(datos.ventas.some(v => v.clienteId === c.id)){
    return aviso('No se puede eliminar: el cliente tiene ventas registradas.', true);
  }
  if(!confirm(`¿Eliminar a ${c.nombre}?`)) return;
  datos.clientes = datos.clientes.filter(x => x.id !== c.id);
  guardar();
  renderClientes(); llenarSelectClientes();
  aviso('Cliente eliminado');
}

$('#btnNuevoCliente').addEventListener('click', () => abrirCliente());
$('#cCancel').addEventListener('click', () => $('#dlgCliente').close());
$('#cGuardar').addEventListener('click', () => {
  const nombre = $('#cNombre').value.trim();
  if(!nombre) return $('#errCli').textContent = 'El nombre es obligatorio.';
  const campos = {nombre, tel: $('#cTel').value.trim(), notas: $('#cNotas').value.trim()};
  if(clienteEditId) Object.assign(cli(clienteEditId), campos);
  else datos.clientes.push({id: siguienteId(datos.clientes), ...campos, abonos: []});
  guardar();
  $('#dlgCliente').close();
  renderClientes(); llenarSelectClientes();
  aviso('Cliente guardado');
});

/* =========================================================
   INVENTARIO Y PRODUCTOS
   ========================================================= */
let productoEditId = null;

function abrirProducto(id){
  productoEditId = id ?? null;
  const p = id ? prod(id) : null;
  $('#tProd').textContent = p ? `Editar ${p.nombre}` : 'Nuevo producto (en blanco)';
  $('#pNombre').value = p?.nombre ?? '';
  $('#pPrecio').value = p?.precio ?? '';
  $('#pCosto').value = p?.costo ?? '';
  $('#pStock').value = p?.stock ?? 0;
  $('#pStock').disabled = !!p;           // El stock se cambia con movimientos
  $('#pEmoji').value = p?.emoji ?? '';
  $('#errProd').textContent = '';
  $('#dlgProd').showModal();
}

$('#pCancel').addEventListener('click', () => $('#dlgProd').close());
$('#pGuardar').addEventListener('click', () => {
  const nombre = $('#pNombre').value.trim();
  const precio = Number($('#pPrecio').value);
  const costo = Number($('#pCosto').value);
  const stock = Math.trunc(Number($('#pStock').value));
  const emoji = $('#pEmoji').value.trim() || '🍧';
  const err = $('#errProd');
  if(!nombre) return err.textContent = 'El nombre es obligatorio.';
  if(!(precio > 0)) return err.textContent = 'El precio de venta debe ser mayor a cero.';
  if(!(costo >= 0)) return err.textContent = 'El costo no puede ser negativo.';
  if(!(stock >= 0)) return err.textContent = 'El stock inicial no puede ser negativo.';
  if(datos.productos.some(p => p.id !== productoEditId && p.nombre.toLowerCase() === nombre.toLowerCase())){
    return err.textContent = 'Ya existe un producto con ese nombre.';
  }
  if(productoEditId){
    Object.assign(prod(productoEditId), {nombre, precio, costo, emoji});
  }else{
    datos.productos.push({id: siguienteId(datos.productos), nombre, precio, costo, stock, emoji, color: '#ffa41b'});
  }
  guardar();
  $('#dlgProd').close();
  renderVentas(); renderInventario();
  aviso('Producto guardado');
});

function renderInventario(){
  $('#tablaStock').innerHTML = datos.productos.map(p => `
    <tr>
      <td>${esc(p.emoji)} ${esc(p.nombre)}</td>
      <td class="${p.stock <= 0 ? 'bajo-txt' : ''}">${p.stock}${p.stock <= 0 ? ' ⚠ agotado' : ''}</td>
      <td class="money">${COP(p.precio)}</td>
      <td><button class="sec" type="button" data-editar-prod="${p.id}">Editar</button></td>
    </tr>`).join('');
  $('#movProd').innerHTML = datos.productos.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  const movs = datos.movimientos.slice(0, 30);
  $('#listaMov').innerHTML = movs.length ? movs.map(m => `
    <div class="card item">
      <div class="info">
        <strong>${esc(m.producto)} · ${m.tipo}</strong>
        <span class="muted">${esc(m.motivo) || 'Sin motivo'} · ${fechaCorta(m.fecha)}</span>
      </div>
      <span class="money">${m.cant > 0 ? '+' : ''}${m.cant}</span>
    </div>`).join('') : '<p class="muted">Sin movimientos todavía.</p>';
}

$('#tablaStock').addEventListener('click', e => {
  const b = e.target.closest('[data-editar-prod]');
  if(b) abrirProducto(Number(b.dataset.editarProd));
});

$('#formMov').addEventListener('submit', e => {
  e.preventDefault();
  const p = prod(Number($('#movProd').value));
  const tipo = $('#movTipo').value;
  const cant = Math.trunc(Number($('#movCant').value));
  const motivo = $('#movMotivo').value.trim();
  if(!cant) return aviso('La cantidad debe ser distinta de cero.', true);
  if(tipo === 'entrada' && cant < 0) return aviso('Una entrada debe ser positiva.', true);
  if(tipo === 'ajuste' && !motivo) return aviso('Los ajustes manuales requieren un motivo.', true);
  if(p.stock + cant < 0) return aviso(`El stock de ${p.nombre} no puede quedar en negativo (hay ${p.stock}).`, true);
  p.stock += cant;
  datos.movimientos.unshift({fecha: ahora(), producto: p.nombre, tipo, cant, motivo});
  guardar();
  $('#movMotivo').value = '';
  renderInventario();
  aviso(`Stock de ${p.nombre}: ${p.stock}`);
});

/* =========================================================
   RENTABILIDAD
   ========================================================= */
function resumenPorProducto(vs){
  return datos.productos.map(p => {
    const its = vs.flatMap(v => v.items.filter(i => i.id === p.id));
    const cant = its.reduce((a,i) => a + i.cant, 0);
    const ingreso = its.reduce((a,i) => a + i.cant * i.precio, 0);
    const util = its.reduce((a,i) => a + i.cant * (i.precio - i.costo), 0);
    const margen = p.precio ? (p.precio - p.costo) / p.precio * 100 : 0;
    return {p, cant, ingreso, util, margen};
  });
}

function renderRentabilidad(){
  const per = $('#periodo').value;
  const vs = datos.ventas.filter(v => enPeriodo(v.fecha, per));
  const totalVentas = vs.reduce((a,v) => a + v.total, 0);
  const costos = vs.reduce((a,v) => a + v.items.reduce((b,i) => b + i.costo * i.cant, 0), 0);
  const unidades = vs.reduce((a,v) => a + v.items.reduce((b,i) => b + i.cant, 0), 0);
  const resumen = resumenPorProducto(vs);

  animarNumero($('#kVentas'), totalVentas, COP);
  animarNumero($('#kUtil'), totalVentas - costos, COP);
  animarNumero($('#kCartera'), cartera(), COP);
  animarNumero($('#kUnid'), unidades);

  // Gráfico de unidades por producto
  const max = Math.max(1, ...resumen.map(x => x.cant));
  const W = 600, H = 220, gap = 10, bw = (W - gap * (resumen.length + 1)) / resumen.length;
  const chart = $('#chartProd');
  chart.innerHTML = resumen.map((x, i) => {
    const h = (x.cant / max) * (H - 40), xx = gap + i * (bw + gap), yy = H - 24 - h;
    return `<g>
      <rect x="${xx}" y="${yy}" width="${bw}" height="${h}" rx="8" fill="${x.p.color}" stroke="#2b1a12" stroke-width="2" style="transition-delay:${i * 90}ms"/>
      <text x="${xx + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#2b1a12">${esc(x.p.nombre.split(' ')[0])}</text>
      <text x="${xx + bw / 2}" y="${yy - 6}" text-anchor="middle" font-size="13" font-weight="800" fill="#2b1a12">${x.cant}</text>
    </g>`;
  }).join('');
  dibujarBarras(chart);

  $('#tablaMargen').innerHTML = resumen.map(x => `
    <tr>
      <td>${esc(x.p.emoji)} ${esc(x.p.nombre)}</td><td>${COP(x.p.precio)}</td><td>${COP(x.p.costo)}</td>
      <td>${x.margen.toFixed(0)}%</td><td class="money">${COP(x.util)}</td>
    </tr>`).join('');

  const masVendido = [...resumen].sort((a,b) => b.cant - a.cant)[0];
  const masRentable = [...resumen].sort((a,b) => b.util - a.util)[0];
  $('#destacados').innerHTML = vs.length
    ? `Más vendido: <strong>${esc(masVendido.p.nombre)}</strong> (${masVendido.cant} uds) · Más rentable: <strong>${esc(masRentable.p.nombre)}</strong> (${COP(masRentable.util)})`
    : 'Aún no hay ventas en este periodo.';

  // Ventas por método de pago
  const colores = {efectivo:'var(--lulo)', transferencia:'var(--cielo)', fiao:'var(--mango)'};
  const porPago = ['efectivo','transferencia','fiao'].map(m => ({m, t: vs.filter(v => v.pago === m).reduce((a,v) => a + v.total, 0)}));
  const maxPago = Math.max(1, ...porPago.map(x => x.t));
  $('#barrasPago').innerHTML = porPago.map(x => `
    <div class="barra" style="--c:${colores[x.m]};--p:${(x.t / maxPago * 100).toFixed(0)}%">
      <div style="display:flex;justify-content:space-between;font-weight:700"><span style="text-transform:capitalize">${x.m}</span><span class="money">${COP(x.t)}</span></div>
      <div class="track"><div class="fill"></div></div>
    </div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => $$('#barrasPago .barra').forEach(b => b.classList.add('anim'))));

  // Ranking de cartera fiao
  const ranking = datos.clientes.map(c => ({c, s: saldo(c)})).filter(x => x.s > 0).sort((a,b) => b.s - a.s);
  $('#ranking').innerHTML = ranking.length
    ? ranking.map((x, i) => `<div class="item"><span><strong>${i + 1}. ${esc(x.c.nombre)}</strong></span><span class="money bajo-txt">${COP(x.s)}</span></div>`).join('')
    : '<p class="muted">No hay saldos pendientes.</p>';
}
$('#periodo').addEventListener('change', renderRentabilidad);

/* =========================================================
   ESTADÍSTICAS (incluye descarga en PDF vía impresión)
   ========================================================= */
function renderEstadisticas(){
  const per = $('#estPeriodo').value;
  const vs = datos.ventas.filter(v => enPeriodo(v.fecha, per));
  const total = vs.reduce((a,v) => a + v.total, 0);
  const costo = vs.reduce((a,v) => a + v.items.reduce((b,i) => b + i.costo * i.cant, 0), 0);
  const unidades = vs.reduce((a,v) => a + v.items.reduce((b,i) => b + i.cant, 0), 0);
  animarNumero($('#eVentas'), total, COP);
  animarNumero($('#eUtil'), total - costo, COP);
  animarNumero($('#eUnid'), unidades);
  animarNumero($('#eTicket'), vs.length ? Math.round(total / vs.length) : 0, COP);

  // Ventas de los últimos 7 días
  const dias = [...Array(7)].map((_, k) => { const d = hoy(); d.setDate(d.getDate() - (6 - k)); return d; });
  const montos = dias.map(d => datos.ventas
    .filter(v => new Date(v.fecha).toDateString() === d.toDateString())
    .reduce((a,v) => a + v.total, 0));
  const max = Math.max(1, ...montos), W = 600, H = 220, gap = 12, bw = (W - gap * 8) / 7;
  const chart = $('#chartDias');
  chart.innerHTML = montos.map((m, i) => {
    const h = (m / max) * (H - 44), x = gap + i * (bw + gap), y = H - 24 - h;
    const etiqueta = m ? Math.round(m / 1000) + 'k' : '';
    return `<g>
      <rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="8" fill="#ffa41b" stroke="#2b1a12" stroke-width="2" style="transition-delay:${i * 80}ms"/>
      <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#2b1a12">${dias[i].toLocaleDateString('es-CO', {weekday:'short'})}</text>
      <text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="12" font-weight="800" fill="#2b1a12">${etiqueta}</text>
    </g>`;
  }).join('');
  dibujarBarras(chart);

  // Productos más vendidos
  const top = resumenPorProducto(vs).sort((a,b) => b.cant - a.cant).slice(0, 5);
  const mx = Math.max(1, ...top.map(t => t.cant));
  $('#topProd').innerHTML = top.map(t => `
    <div class="barra" style="--c:${t.p.color};--p:${(t.cant / mx * 100).toFixed(0)}%">
      <div style="display:flex;justify-content:space-between;font-weight:700"><span>${esc(t.p.nombre)}</span><span>${t.cant} uds</span></div>
      <div class="track"><div class="fill"></div></div>
    </div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => $$('#topProd .barra').forEach(b => b.classList.add('anim'))));

  $('#estFecha').textContent = hoy().toLocaleString('es-CO');
}
$('#estPeriodo').addEventListener('change', renderEstadisticas);
$('#btnPdf').addEventListener('click', () => {
  renderEstadisticas();
  // Se abre el diálogo de impresión; el destino "Guardar como PDF" genera el archivo.
  setTimeout(() => window.print(), 500);
});

/* =========================================================
   EXPORTAR E IMPORTAR
   ========================================================= */
function descargar(nombre, contenido, tipo){
  const blob = new Blob([contenido], {type: tipo});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// CSV con punto y coma (formato que Excel en Colombia abre bien) y BOM para tildes.
const csvCelda = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const aCSV = filas => '\uFEFF' + filas.map(f => f.map(csvCelda).join(';')).join('\r\n');

const exportadores = {
  ventas: () => aCSV([
    ['Fecha','Producto','Cantidad','Precio','Costo','Pago','Cliente'],
    ...datos.ventas.flatMap(v => v.items.map(i => [
      v.fecha.slice(0, 10), prod(i.id)?.nombre, i.cant, i.precio, i.costo, v.pago,
      v.clienteId ? cli(v.clienteId)?.nombre : ''
    ]))
  ]),
  clientes: () => aCSV([
    ['Nombre','Teléfono','Notas','Compras fiadas','Abonos','Saldo'],
    ...datos.clientes.map(c => [c.nombre, c.tel, c.notas, fiadoDe(c.id), abonosDe(c), saldo(c)])
  ]),
  inventario: () => aCSV([
    ['Producto','Precio','Costo','Stock'],
    ...datos.productos.map(p => [p.nombre, p.precio, p.costo, p.stock])
  ])
};
$$('[data-csv]').forEach(b => b.addEventListener('click', () =>
  descargar(`bolisio-${b.dataset.csv}.csv`, exportadores[b.dataset.csv](), 'text/csv;charset=utf-8')));

$('#btnJson').addEventListener('click', () =>
  descargar(`bolisio-respaldo-${hoy().toISOString().slice(0,10)}.json`,
    JSON.stringify({app:'BolisIO', version:1, fecha: ahora(), ...datos}, null, 2),
    'application/json'));

$('#fileJson').addEventListener('change', async e => {
  const err = $('#errExp');
  const archivo = e.target.files[0];
  e.target.value = '';
  if(!archivo) return;
  try{
    const d = JSON.parse(await archivo.text());
    if(d.app !== 'BolisIO' || !Array.isArray(d.productos) || !Array.isArray(d.ventas) || !Array.isArray(d.clientes)){
      throw new Error('formato no válido');
    }
    if(!confirm('Esto reemplazará los datos actuales por los del respaldo. ¿Continuar?')) return;
    datos = {productos: d.productos, clientes: d.clientes, ventas: d.ventas, movimientos: d.movimientos || []};
    guardar();
    for(const k of Object.keys(carrito)) delete carrito[k];
    err.textContent = '';
    irA('ventas');
    aviso('Respaldo importado');
  }catch(x){
    err.textContent = 'El archivo no es un respaldo válido de BolisIO.';
  }
});

/* =========================================================
   INICIO
   ========================================================= */
renderVentas();
renderInventario();
renderClientes();
llenarSelectClientes();

// Service worker: funcionamiento offline. Ruta relativa para GitHub Pages.
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker no registrado:', err));
  });
}
