 // --- INICIO: CONFIGURACIÓN Y VARIABLES GLOBALES ---
    const firebaseConfig = { apiKey: "AIzaSyDtlj3ppT9WBGMR60SZx0TZmAo3BXQWDXO", authDomain: "rastreador-de-ordenes.firebaseapp.com", projectId: "rastreador-de-ordenes", storageBucket: "rastreador-de-ordenes.appspot.com", messagingSenderId: "956052823395", appId: "1:956052823395:web:2ba74d9591d2b24c3cc756" };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    document.addEventListener('DOMContentLoaded', () => {
        const doc = (id) => document.getElementById(id);
        const views = {
            menu: doc('menuView'),
            '901': doc('view901'),
            terminaciones: doc('viewTerminaciones'),
            produccionHora: doc('viewProduccionHora'),
            tarimasConfirmadas: doc('viewTarimasConfirmadas'), // <-- AÑADE ESTA
            boxID: doc('viewBoxID'),
            liveDashboard: doc('viewLiveDashboard'),
            ordenesDia: doc('viewOrdenesDia')
        };
        let session = { isMaster: false };
        let activeView = 'menu';
        let params = {
    '901_config': { columns: [], userFilter: [] },
    terminaciones_config: {
        zpptwc_cols: [],
        coois_cols: [],
        final_cols: [],
        area_config: { source_col: '', mappings: [] },
        fiber_rules: {} // Aseguramos que esto exista
    },
    produccion_hora_config: {
        packers: []
    },
    terminaciones_areas_config: {} // Agregamos este para que no falle al cargar
};
		// --- VARIABLE GLOBAL NUEVA ---
        let globalAreasCache = null; // Para no gastar lecturas recargando el select de áreas
        let reportData = { zpptwc: null, coois: null };
        let productionChart = null;
        let fiberPieCharts = [];
        let productionReportData = null;
        let weeklyProductionChart = null;
        let liveListener = null; // El "listener" que escucha en vivo
        let liveProductionChart = null; // La gráfica de barras en vivo
// --- INICIALIZACIÓN DE TERMINACIONES (Poner junto a tus otros listeners) ---
const todayTerm = new Date();
const lastWeekTerm = new Date();
lastWeekTerm.setDate(todayTerm.getDate() - 6);

// Poner fechas por defecto
if(doc('term_fecha_inicio')) doc('term_fecha_inicio').value = lastWeekTerm.toISOString().split('T')[0];
if(doc('term_fecha_fin')) doc('term_fecha_fin').value = todayTerm.toISOString().split('T')[0];

// Activar el botón de consulta
if(doc('consultarTerminacionesHistoricoBtn')) {
    doc('consultarTerminacionesHistoricoBtn').addEventListener('click', consultarTerminacionesHistorico);
}

        // --- INICIO: LÓGICA DE NAVEGACIÓN Y UI GENERAL ---
        function switchView(viewKey) {
    const currentViewEl = views[activeView];
    const nextViewEl = views[viewKey];
    if (!nextViewEl) return;
    activeView = viewKey;
    currentViewEl.style.opacity = '0';
    setTimeout(() => {
        currentViewEl.style.display = 'none';
        nextViewEl.style.display = 'block';
        if (viewKey === 'menu') {
            nextViewEl.style.display = 'flex';
        }
        requestAnimationFrame(() => { nextViewEl.style.opacity = '1'; });
        if (viewKey === 'produccionHora') {
            loadAreasForProductionReport();
	} else if (viewKey === 'tarimasConfirmadas') {
                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');
                doc('prodTarimas_fecha').value = `${year}-${month}-${day}`;
                doc('prodTarimas_turno').value = getAutoCurrentShift(); 
                loadAreasForTarimasReport();
                renderTarimasTable([]); // Limpia tabla
              // --- LÍNEAS DE ERROR ELIMINADAS ---
            } else if (viewKey === 'boxID') {
            	doc('fileDropAreaBoxID').style.borderColor = 'var(--border-color)';
        }
    }, 300);
}

        doc('reporteProduccionBtn').addEventListener('click', () => switchView('produccionHora'));
        doc('reporteOrdenesDiaBtn').addEventListener('click', () => {
    switchView('ordenesDia');
    // Poner fecha de hoy por defecto si está vacía
    if(!doc('ordenesDia_fecha').value) {
        const today = new Date();
        doc('ordenesDia_fecha').value = today.toISOString().split('T')[0];
    }
});
doc('view901Btn').addEventListener('click', () => switchView('901'));
doc('reporteTerminacionesBtn').addEventListener('click', () => switchView('terminaciones'));
		doc('reporteTarimasBtn').addEventListener('click', () => switchView('tarimasConfirmadas'));
       doc('consultarTarimasBtn').addEventListener('click', consultarTarimas);
		doc('calcularTerminacionesDiaBtn').addEventListener('click', consultarTerminacionesConfirmadas);
		doc('reporteBoxIDBtn').addEventListener('click', () => switchView('boxID')); // <-- LÍNEA NUEVA
doc('liveDashboardBtn').addEventListener('click', () => showLiveDashboard());
document.querySelectorAll('.backToMenuBtn').forEach(btn => btn.addEventListener('click', () => {
        if (activeView === 'liveDashboard') {
            stopLiveDashboard(); // Apagamos el listener si estábamos en el dashboard
        }
        switchView('menu');
    }));

        let currentTheme = localStorage.getItem('theme') || 'dark';
        function applyTheme(theme) {
            document.body.className = `${theme}-theme`;
            document.querySelectorAll('.themeToggleBtn').forEach(btn => {
                const sunIcon = btn.querySelector('.sun-icon');
                const moonIcon = btn.querySelector('.moon-icon');
                if (sunIcon && moonIcon) {
                    sunIcon.style.display = theme === 'light' ? 'none' : 'block';
                    moonIcon.style.display = theme === 'light' ? 'block' : 'none';
                }
            });
            if (productionChart || fiberPieChart1 || fiberPieChart2 || weeklyProductionChart) {
                updateChartTheme();
            }
        }
        document.querySelectorAll('.themeToggleBtn').forEach(btn => btn.addEventListener('click', () => { currentTheme = currentTheme === 'light' ? 'dark' : 'light'; localStorage.setItem('theme', currentTheme); applyTheme(currentTheme); }));

        const modalOverlay = doc('modalOverlay');
        function showModal(title, content) { doc('modalTitle').textContent = title; doc('modalBody').innerHTML = content; modalOverlay.classList.add('visible'); }
        function hideModal() { modalOverlay.classList.remove('visible'); }
        doc('modalClose').addEventListener('click', hideModal);
        modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) hideModal(); });

        document.querySelectorAll('.settingsBtn').forEach(btn => btn.addEventListener('click', () => { session.isMaster ? showParamsModal() : showLoginModal(); }));
        function showLoginModal() { const content = `<p style="text-align: center;">Introduce las credenciales de maestro.</p><input type="text" id="userInput" placeholder="Usuario"><input type="password" id="passInput" placeholder="Contraseña"><button id="loginBtn" class="btn" style="margin-top: 16px; width: 100%;">Autenticar</button><div id="login-error-msg"></div>`; showModal('Autenticación Maestra', content); doc('loginBtn').addEventListener('click', checkMasterCredentials); }
        function checkMasterCredentials() { const errorMsgEl = doc('login-error-msg'); if (doc('userInput').value === 'LUNAU' && doc('passInput').value === 'Resoner96') { session.isMaster = true; sessionStorage.setItem('reportesMasterSession', 'true'); hideModal(); showParamsModal(); } else { errorMsgEl.textContent = 'Credenciales incorrectas.'; } }

        // --- INICIO: LÓGICA DE MODALES DE CONFIGURACIÓN ---
        function showParamsModal() {
    if (activeView === '901') {
        const config = params['901_config'];
        const filterText = (config.userFilter || []).join(', ');
        const paramsHTML = `<ul class="param-list param-list-901">${(config.columns || []).map(p => createParamItem901(p.key, p.startCell)).join('')}</ul>`;
        const content = `<div class="user-filter-container"><label for="userFilterInput">Filtrar por Usuarios (separados por coma)</label><textarea id="userFilterInput" placeholder="PINTORA2, LUNAU2... (dejar vacío para incluir a todos)">${filterText}</textarea></div><hr style="border-color: var(--border-color); margin: 16px 0;"><p style="text-align:center;">Define los nombres de columna y la celda de inicio de cada una (ej. A2).</p>${paramsHTML}<button id="addParam901Btn" class="btn" style="width: auto; padding: 8px 16px;">Añadir Columna</button><button id="saveParams901Btn" class="btn" style="margin-top: 20px; width: 100%;">Guardar Mapeo y Filtros</button>`;
        showModal('Configurar Mapeo y Filtros de 901', content);
        doc('addParam901Btn').addEventListener('click', () => doc('modalBody').querySelector('.param-list-901').insertAdjacentHTML('beforeend', createParamItem901('', '')));
        doc('saveParams901Btn').addEventListener('click', saveParams901);
    } else if (activeView === 'terminaciones') {
        showTerminacionesConfigModal();
    } else if (activeView === 'produccionHora') {
        showProduccionHoraConfigModal();
    } else if (activeView === 'tarimasConfirmadas') { // <-- ¡AQUÍ ESTÁ EL AJUSTE!
        showAreaConfig();
    }
}

        function showProduccionHoraConfigModal() {
            const config = params.produccion_hora_config;
            const content = `
                <div class="collapsible-section open" id="packerRegistrySection">
                    <div class="collapsible-header">Base de Datos de Empacadores</div>
                    <div class="collapsible-content">
                        <p>Añada, edite o elimine empacadores para autocompletar en el panel de control. Los cambios se guardan al presionar el botón de abajo.</p>
                        <form id="addPackerForm">
                            <input type="text" id="newPackerId" placeholder="ID Empacador" required>
                            <select id="newPackerArea">${doc('prod_area').innerHTML}</select>
                            <input type="number" id="newPackerLinea" placeholder="Línea #" required min="1" style="width: 100%; padding: 8px; box-sizing: border-box; border-radius: 6px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-primary);">
                            <select id="newPackerTurno" required>${doc('prod_turno').innerHTML}</select>
                            <button type="submit" class="btn" style="padding: 8px 12px; font-size: 1rem;">+</button>
                        </form>
                        <ul id="packerList"></ul>
                    </div>
                </div>
                <button id="saveProduccionHoraConfigBtn" class="btn" style="margin-top: 20px; width: 100%;">Guardar Base de Datos</button>
            `;
            showModal('Configurar Empacadores', content);
            doc('saveProduccionHoraConfigBtn').addEventListener('click', saveProduccionHoraConfig);

            const section = doc('packerRegistrySection');
            section.querySelector('.collapsible-header').addEventListener('click', () => {
                section.classList.toggle('open');
            });

            doc('addPackerForm').addEventListener('submit', (e) => {
                e.preventDefault();
                const newPacker = {
                    id: doc('newPackerId').value.trim().toUpperCase(),
                    area: doc('newPackerArea').value,
                    linea: doc('newPackerLinea').value, // Asegúrate que este sea .value (del input numérico)
                    turno: doc('newPackerTurno').value
                };

                // --- ¡LÓGICA MEJORADA! ---
                // Buscamos si ya existe una entrada idéntica (mismo ID, misma Línea, mismo Turno)
                const yaExiste = params.produccion_hora_config.packers.some(
                    p => p.id === newPacker.id && p.linea === newPacker.linea && p.turno === newPacker.turno
                );

                if (newPacker.id && !yaExiste) {
                    params.produccion_hora_config.packers.push(newPacker);
                    renderPackerListInModal();
                    doc('newPackerId').value = '';
                } else if (newPacker.id && yaExiste) {
                    alert("Error: Ese empacador ya está registrado en esa misma línea y turno.");
                }
            });

            renderPackerListInModal();
        }

        function renderPackerListInModal() {
            const listEl = doc('packerList');
            if (!listEl) return;
            const packers = params.produccion_hora_config.packers || [];
            packers.sort((a, b) => a.id.localeCompare(b.id));

            listEl.innerHTML = packers.map((p, index) => `
                <li>
                    <span><strong>${p.id}</strong></span>
                    <span>${p.area}</span>
                    <span>Línea ${p.linea}</span>
                    <span>${p.turno}</span>
                    <button class="btn-danger" data-index="${index}" style="font-size: 0.8rem; padding: 4px 8px;">X</button>
                </li>
            `).join('');

            listEl.querySelectorAll('.btn-danger').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.dataset.index, 10);
                    params.produccion_hora_config.packers.splice(index, 1);
                    renderPackerListInModal();
                });
            });
        }

        async function saveProduccionHoraConfig() {
            const newConfig = {
                packers: params.produccion_hora_config.packers || []
            };
            try {
                await db.collection('report_configs').doc('produccion_hora_params').set(newConfig);
                params.produccion_hora_config = newConfig;
                applyProduccionHoraConfig();
                showModal('Éxito', '<p>Base de datos de empacadores guardada.</p>');
            } catch (e) {
                showModal('Error', '<p>No se pudo guardar la configuración.</p>');
            }
        }

        function createParamItem901(key, startCell) { return `<li class="param-item" style="grid-template-columns: 1fr 1fr auto;"><input type="text" class="param-key" placeholder="Nombre de Columna" value="${key || ''}"><input type="text" class="param-cell" placeholder="Celda de Inicio (ej. A2)" value="${startCell || ''}"><button class="btn btn-danger" onclick="this.parentElement.remove()">X</button></li>`; }

        async function saveParams901() {
            const newColumns = Array.from(doc('modalBody').querySelectorAll('.param-item')).map(item => ({ key: item.querySelector('.param-key').value.trim(), startCell: item.querySelector('.param-cell').value.trim().toUpperCase() })).filter(p => p.key && p.startCell);
            const userFilter = doc('userFilterInput').value.split(',').map(u => u.trim()).filter(Boolean);
            const newConfig = { columns: newColumns, userFilter: userFilter };
            try {
                await db.collection('report_configs').doc('901_params').set(newConfig);
                params['901_config'] = newConfig;
                showModal('Éxito', '<p>Mapeo y filtros de 901 guardados.</p>');
            } catch (e) {
                showModal('Error', '<p>No se pudo guardar la configuración.</p>');
            }
        }

        // --- BLOQUE 1: MODAL DE CONFIGURACIÓN ACTUALIZADO ---

// --- MODAL DE CONFIGURACIÓN CORREGIDO (LISTENERS EXACTOS) ---
function showTerminacionesConfigModal() {
    const config = params.terminaciones_config;
    if (!config.fiber_rules) config.fiber_rules = {};

    const content = `
        <div class="modal-tabs">
            <button class="tab-btn active" data-tab="zpptwc">1. Mapeo Zpptwc</button>
            <button class="tab-btn" data-tab="coois">2. Mapeo Coois</button>
            <button class="tab-btn" data-tab="areas">3. Mapeo de Áreas</button>
            <button class="tab-btn" data-tab="final">4. Columnas Finales</button>
            <button class="tab-btn" data-tab="reglas">5. Reglas Fibras</button>
        </div>

        <div id="tab-zpptwc" class="tab-content active">
            <p>Define un nombre clave y la letra de la columna para Zpptwc.</p>
            <ul class="param-list">${(config.zpptwc_cols || []).map(p => createSourceColHTML(p.key, p.excel_col)).join('')}</ul>
        </div>

        <div id="tab-coois" class="tab-content">
            <p>Define un nombre clave y la letra de la columna para Coois.</p>
            <ul class="param-list">${(config.coois_cols || []).map(p => createSourceColHTML(p.key, p.excel_col)).join('')}</ul>
        </div>

        <div id="tab-areas" class="tab-content">
            <div class="area-source-container">
                <label>Columna Clave de Coois (ej. MRP)</label>
                <input type="text" id="area-source-col" value="${(config.area_config || {}).source_col || ''}">
            </div>
            <ul class="area-list">${((config.area_config || {}).mappings || []).map(a => createAreaItemHTML(a.code, a.name)).join('')}</ul>
        </div>

        <div id="tab-final" class="tab-content">
            <p>Columnas finales del reporte unificado.</p>
            <ul class="param-list">${(config.final_cols || []).map(p => createFinalColHTML(p.key, p.type, p.value)).join('')}</ul>
        </div>

        <div id="tab-reglas" class="tab-content">
            <div class="control-group" style="margin-bottom: 15px;">
                <label>Seleccionar Área para Configurar:</label>
                <select id="ruleAreaSelect" class="filter-input" style="padding:8px;">
                    <option value="" disabled selected>Selecciona un área...</option>
                </select>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:5px;">Define cómo leer las fibras. Pon <strong>Len: 0</strong> para usar el Multiplicador como valor fijo.</p>
            </div>
            <div id="rulesContainer" style="border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; min-height: 200px; max-height: 300px; overflow-y: auto;">
                <p style="text-align:center; color:var(--text-dark); margin-top: 20px;">Primero selecciona un área arriba.</p>
            </div>
            <button id="addRuleBtn" class="btn btn-glass" style="width:100%; margin-top:10px; display:none;">+ Añadir Regla</button>
        </div>

        <div class="modal-footer" style="display:flex; gap:10px; margin-top:20px;">
            <button class="addBtn btn" style="flex:1;">Añadir Fila (Tabs 1-4)</button>
            <button id="saveTerminacionesSettingsBtn" class="btn" style="flex:2;">Guardar Todo</button>
        </div>`;

    showModal('Configurar Terminaciones', content);

    // Lógica de Tabs
    const modalBody = doc('modalBody');
    modalBody.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
        modalBody.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        doc(`tab-${btn.dataset.tab}`).classList.add('active');
        if (btn.dataset.tab === 'reglas') updateRuleAreaSelect();
    }));

    // Lógica Añadir Fila (Tabs 1-4)
    modalBody.querySelector('.addBtn').addEventListener('click', () => {
        const activeTab = modalBody.querySelector('.tab-content.active');
        if (activeTab.id === 'tab-areas') activeTab.querySelector('.area-list').insertAdjacentHTML('beforeend', createAreaItemHTML('', ''));
        else if (activeTab.id === 'tab-final') activeTab.querySelector('.param-list').insertAdjacentHTML('beforeend', createFinalColHTML('', 'source', ''));
        else if (activeTab.id === 'tab-reglas') { /* Nada */ }
        else activeTab.querySelector('.param-list').insertAdjacentHTML('beforeend', createSourceColHTML('', ''));
    });

    doc('saveTerminacionesSettingsBtn').addEventListener('click', saveTerminacionesSettings);

    // --- LÓGICA PESTAÑA REGLAS ---
    const areaSelect = doc('ruleAreaSelect');
    const rulesContainer = doc('rulesContainer');
    const addRuleBtn = doc('addRuleBtn');

    function updateRuleAreaSelect() {
        const currentVal = areaSelect.value;
        areaSelect.innerHTML = '<option value="DEFAULT">DEFAULT (General)</option>';
        const areaInputs = document.querySelectorAll('#tab-areas .area-name');
        const uniqueAreas = new Set();
        areaInputs.forEach(input => { if(input.value) uniqueAreas.add(input.value.trim().toUpperCase()); });
        
        uniqueAreas.forEach(area => {
            const opt = document.createElement('option');
            opt.value = area;
            opt.textContent = area;
            areaSelect.appendChild(opt);
        });
        if(currentVal) areaSelect.value = currentVal;
    }

    areaSelect.addEventListener('change', () => {
        const area = areaSelect.value;
        addRuleBtn.style.display = 'block';
        renderRulesForArea(area);
    });

    function renderRulesForArea(area) {
        const rules = config.fiber_rules[area] || [];
        if (rules.length === 0) {
            rulesContainer.innerHTML = '<p style="text-align:center; font-style:italic; opacity:0.7;">No hay reglas específicas. Se usará el cálculo por defecto.</p>';
        } else {
            rulesContainer.innerHTML = '<ul class="param-list">' + rules.map(r => createRuleItemHTML(r)).join('') + '</ul>';
        }
    }

    addRuleBtn.addEventListener('click', () => {
        const area = areaSelect.value;
        if (!config.fiber_rules[area]) config.fiber_rules[area] = [];
        config.fiber_rules[area].push({ prefix: '', start: 4, length: 1, t_equals_12: true, multiplier: 1 });
        renderRulesForArea(area);
    });

    // --- LISTENERS CORREGIDOS (AQUÍ ESTÁ LA MAGIA) ---
    rulesContainer.addEventListener('input', (e) => {
        const item = e.target.closest('.rule-item');
        if (!item) return;
        const index = Array.from(item.parentNode.children).indexOf(item);
        const area = areaSelect.value;
        const rule = config.fiber_rules[area][index];

        if (e.target.classList.contains('rule-prefix')) rule.prefix = e.target.value.toUpperCase();
        
        if (e.target.classList.contains('rule-start')) {
            const val = parseInt(e.target.value);
            rule.start = isNaN(val) ? 4 : val;
        }
        
        if (e.target.classList.contains('rule-len')) {
            const val = parseInt(e.target.value);
            // CORRECCIÓN: Si es NaN (vacío) pon 1, pero si es 0, déjalo ser 0.
            rule.length = isNaN(val) ? 1 : val; 
        }
        
        if (e.target.classList.contains('rule-mult')) {
            const val = parseInt(e.target.value);
            // CORRECCIÓN: Igual aquí, permite el 0 si quisieras (aunque raro en mult)
            rule.multiplier = isNaN(val) ? 1 : val;
        }
        
        if (e.target.classList.contains('rule-check')) rule.t_equals_12 = e.target.checked;
    });

    rulesContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-del-rule')) {
            const item = e.target.closest('.rule-item');
            const index = Array.from(item.parentNode.children).indexOf(item);
            const area = areaSelect.value;
            config.fiber_rules[area].splice(index, 1);
            renderRulesForArea(area);
        }
    });
}

// Helper HTML para cada regla (incluye multiplicador para el caso DFB)
// --- HELPER HTML CORREGIDO (RESPETA EL 0) ---
function createRuleItemHTML(rule) {
    // Validación estricta: Solo usa 1 si el valor es null o undefined. Si es 0, se queda 0.
    const lengthValue = (rule.length !== undefined && rule.length !== null) ? rule.length : 1;
    const multValue = (rule.multiplier !== undefined && rule.multiplier !== null) ? rule.multiplier : 1;
    const startValue = (rule.start !== undefined && rule.start !== null) ? rule.start : 4;

    return `
    <li class="rule-item" style="display: grid; grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr auto auto; gap: 6px; align-items: center; padding: 8px; background: var(--surface-hover-color); margin-bottom: 6px; border-radius: 6px;">
        <input type="text" class="rule-prefix" placeholder="Prefijo (ej. DFB)" value="${rule.prefix || ''}" title="Empieza con...">
        
        <input type="number" class="rule-start" placeholder="Pos" value="${startValue}" title="Posición inicial">
        
        <input type="number" class="rule-len" placeholder="Len" value="${lengthValue}" title="Longitud (0 para valor fijo)">
        
        <input type="number" class="rule-mult" placeholder="x" value="${multValue}" title="Multiplicador (o Valor Fijo si Len=0)">
        
        <label style="font-size:0.7rem; display:flex; align-items:center; gap:2px; cursor:pointer;">
            <input type="checkbox" class="rule-check" ${rule.t_equals_12 ? 'checked' : ''}> T=12
        </label>
        <button class="btn-danger btn-del-rule" style="padding: 2px 6px;">X</button>
    </li>`;
}


        function createSourceColHTML(key, excel_col) { return `<li class="param-item" draggable="true" style="grid-template-columns: auto 1fr 1fr auto;"><span class="drag-handle" title="Arrastrar para reordenar"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle><circle cx="5" cy="5" r="1"></circle><circle cx="5" cy="12" r="1"></circle><circle cx="5" cy="19" r="1"></circle><circle cx="19" cy="5" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="19" cy="19" r="1"></circle></svg></span><input type="text" class="param-key" placeholder="Nombre de Columna" value="${key||''}"><input type="text" class="param-excel-col" placeholder="Letra de Columna (ej. A)" value="${excel_col||''}"><button class="btn btn-danger" onclick="this.parentElement.remove()">X</button></li>`; }
        function createAreaItemHTML(code, name) { return `<li class="area-item" style="grid-template-columns: 1fr 2fr auto;"><input type="text" class="area-code" placeholder="Código MRP" value="${code || ''}"><input type="text" class="area-name" placeholder="Nombre de Área" value="${name || ''}"><button class="btn btn-danger" onclick="this.parentElement.remove()">X</button></li>`; }
        function createFinalColHTML(key, type, value) { const options = `<option value="source">Dato Directo</option><option value="formula">Fórmula (Avanzado)</option><option value="fibras_auto">Fibras (Automático)</option><option value="terminaciones_auto">Terminaciones (Automático)</option><option value="familia_auto">Familia (Automático)</option>`; let selectedOptions = options.replace(`value="${type}"`,`value="${type}" selected`); const isFormula = type === 'formula'; const isSource = type === 'source'; const isAuto = !isFormula && !isSource; return `<li class="param-item" draggable="true" style="grid-template-columns:auto 1fr 1.2fr 2fr auto"><span class="drag-handle" title="Arrastrar para reordenar"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle><circle cx="5" cy="5" r="1"></circle><circle cx="5" cy="12" r="1"></circle><circle cx="5" cy="19" r="1"></circle><circle cx="19" cy="5" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="19" cy="19" r="1"></circle></svg></span><input type="text" class="param-key" placeholder="Nombre Columna Final" value="${key||''}"><select class="param-type">${selectedOptions}</select><div class="${isAuto ? 'hidden' : ''}"><input type="text" class="param-value-input" placeholder="${isFormula ? 'Escribe fórmula...' : 'Nombre Clave de la fuente'}" value="${value||''}" onfocus="populateFormulaHelpers(this, ${isFormula})"><div class="formula-helpers"></div></div><button class="btn btn-danger" onclick="this.parentElement.remove()">X</button></li>`; }

        function getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll('.param-item:not(.dragging)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; }
                else { return closest; }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }

        window.populateFormulaHelpers = (inputElement, isFormula) => { const container = inputElement.nextElementSibling; container.innerHTML = ''; if (!isFormula) return; const modalBody = inputElement.closest('#modalBody'); if (!modalBody) return; const currentKey = inputElement.closest('.param-item').querySelector('.param-key').value; const zpptwc_cols = Array.from(modalBody.querySelectorAll('#tab-zpptwc .param-item')).map(el => el.querySelector('.param-key').value); const coois_cols = Array.from(modalBody.querySelectorAll('#tab-coois .param-item')).map(el => el.querySelector('.param-key').value); const final_cols = Array.from(modalBody.querySelectorAll('#tab-final .param-item')).map(el => el.querySelector('.param-key').value); const availableCols = [...zpptwc_cols, ...coois_cols, ...final_cols.filter(k => k !== currentKey), 'Area'].filter(Boolean); const uniqueCols = [...new Set(availableCols)]; uniqueCols.forEach(colName => { const pill = document.createElement('button'); pill.className = 'helper-pill'; pill.textContent = colName; pill.onclick = (e) => { e.preventDefault(); insertAtCursor(inputElement, `{${colName}}`); }; container.appendChild(pill); }); };
        function insertAtCursor(input, text) { const start = input.selectionStart; input.value = input.value.substring(0, start) + text + input.value.substring(input.selectionEnd); input.focus(); input.selectionEnd = start + text.length; }
        doc('modalOverlay').addEventListener('change', (e) => { if (e.target.classList.contains('param-type')) { const item = e.target.closest('.param-item'); const inputDiv = item.querySelector('div:not(.formula-helpers)'); const isAuto = ['fibras_auto', 'terminaciones_auto', 'familia_auto'].includes(e.target.value); if(inputDiv) inputDiv.classList.toggle('hidden', isAuto); } });

        // --- BLOQUE 2: FUNCIÓN DE GUARDADO ACTUALIZADA ---

async function saveTerminacionesSettings() {
    try {
        const modalBody = document.getElementById('modalBody');
        if (!modalBody) throw new Error("Modal no encontrado");

        const newConfig = {
            zpptwc_cols: Array.from(modalBody.querySelectorAll('#tab-zpptwc .param-item')).map(el => ({ key: el.querySelector('.param-key').value.trim(), excel_col: el.querySelector('.param-excel-col').value.trim().toUpperCase() })),
            coois_cols: Array.from(modalBody.querySelectorAll('#tab-coois .param-item')).map(el => ({ key: el.querySelector('.param-key').value.trim(), excel_col: el.querySelector('.param-excel-col').value.trim().toUpperCase() })),
            area_config: {
                source_col: modalBody.querySelector('#area-source-col').value.trim(),
                mappings: Array.from(modalBody.querySelectorAll('#tab-areas .area-item')).map(el => ({ code: el.querySelector('.area-code').value, name: el.querySelector('.area-name').value }))
            },
            final_cols: Array.from(modalBody.querySelectorAll('#tab-final .param-item')).map(el => ({ key: el.querySelector('.param-key').value.trim(), type: el.querySelector('.param-type').value, value: el.querySelector('.param-value-input').value.trim() })),
            
            // AQUÍ SE GUARDAN LAS NUEVAS REGLAS
            fiber_rules: params.terminaciones_config.fiber_rules || {}
        };

        await db.collection('report_configs').doc('terminaciones_params_v2').set(newConfig);
        params.terminaciones_config = newConfig;
        showModal('Éxito', '<p>Configuración guardada. Las reglas de fibras ahora son dinámicas.</p>');
    } catch (e) {
        console.error("Error guardando config:", e);
        showModal('Error', '<p>No se pudo guardar: ' + e.message + '</p>');
    }
}

        // --- INICIO: CARGA DE DATOS (PARAMS Y ARCHIVOS) ---
        // --- COPIA Y PEGA ESTO PARA REEMPLAZAR TU loadParams ACTUAL ---
async function loadParams(configKey) {
    const docIdMap = {
        '901_config': '901_params',
        'terminaciones_config': 'terminaciones_params_v2',
        'produccion_hora_config': 'produccion_hora_params',
        'terminaciones_areas_config': 'terminaciones_areas_params'
    };
    const docId = docIdMap[configKey];
    if (!docId) return;

    try {
        const docRef = await db.collection('report_configs').doc(docId).get();
        if (docRef.exists) {
            const data = docRef.data();
            
            // Lógica corregida y limpia
            if (configKey === '901_config') {
                params[configKey] = { columns: data.columns || [], userFilter: data.userFilter || [] };
            } else if (configKey === 'terminaciones_config') {
                params.terminaciones_config = { zpptwc_cols: [], coois_cols: [], final_cols: [], area_config: { source_col: '', mappings: [] }, ...data };
            } else if (configKey === 'produccion_hora_config') {
                params.produccion_hora_config = { packers: [], ...data };
                applyProduccionHoraConfig();
            } else if (configKey === 'terminaciones_areas_config') {
                if (!params.terminaciones_areas_config) params.terminaciones_areas_config = {};
                params.terminaciones_areas_config = { ...params.terminaciones_areas_config, ...data };
            }
        }
    } catch(e) { console.error(`Error al cargar ${configKey}:`, e); }
}
		
        function applyProduccionHoraConfig() {
        }

        // --- FUNCIÓN DE REEMPLAZO (JS) ---
        function populatePackerSelects() {
            const turno = doc('prod_turno').value;
            const area = doc('prod_area').value;
            const packers = params.produccion_hora_config.packers || [];
            const container = doc('packerSelectsContainer');
            
            // 1. Encontrar todas las líneas únicas para este turno/área
            const filteredPackers = packers.filter(p => p.turno === turno && (p.area === area || area === 'ALL' || p.area === 'ALL'));
            const lineasUnicas = [...new Set(filteredPackers.map(p => p.linea))].sort((a, b) => a - b);

            // 2. Guardar selecciones actuales antes de limpiar
            const currentSelections = {};
            container.querySelectorAll('select').forEach(select => {
                currentSelections[select.id] = select.value;
            });
            
            // 3. Limpiar y regenerar
            container.innerHTML = '';
            
            lineasUnicas.forEach(linea => {
                const selectId = `prod_linea${linea}_packer`;
                const packersDeLinea = filteredPackers.filter(p => p.linea === linea);
                
                let optionsHtml = '<option value="" disabled selected>Seleccionar...</option>';
                packersDeLinea.sort((a,b) => a.id.localeCompare(b.id)).forEach(p => {
                    optionsHtml += `<option value="${p.id}">${p.id}</option>`;
                });

                const controlGroup = `
                    <div class="control-group" style="display: block;">
                        <label for="${selectId}">Empacador Línea ${linea}</label>
                        <select id="${selectId}">${optionsHtml}</select>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', controlGroup);

                // 4. Restaurar selección si existía
                if (currentSelections[selectId] && packersDeLinea.some(p => p.id === currentSelections[selectId])) {
                    doc(selectId).value = currentSelections[selectId];
                }
            });
        }
        doc('prod_turno').addEventListener('change', populatePackerSelects);
        doc('prod_area').addEventListener('change', populatePackerSelects);


        function setupFileHandler(dropAreaId, inputId, configKey) {
    const dropArea = doc(dropAreaId); 
    const input = doc(inputId);
    if (!dropArea || !input) return;

    const handle = (files) => {
        if (files && files.length) {
            handleFile(files, configKey);
        }
    };

    dropArea.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => { 
        handle(e.target.files);
        e.target.value = ''; // Limpiamos el input para poder cargar el mismo archivo de nuevo
    });
    dropArea.addEventListener('dragover', (e) => e.preventDefault());
    dropArea.addEventListener('drop', (e) => { 
        e.preventDefault(); 
        handle(e.dataTransfer.files);
    });
}

        setupFileHandler('fileDropArea901', 'fileInput901', '901');
setupFileHandler('fileDropAreaZpptwc', 'fileInputZpptwc', 'zpptwc');
setupFileHandler('fileDropAreaCoois', 'fileInputCoois', 'coois');
setupFileHandler('fileDropAreaBoxID', 'fileInputBoxID', 'boxID'); // <-- ESTA ES LA LÍNEA CRÍTICA
setupFileHandler('fileDropAreaGrUsuarios', 'fileInputGrUsuarios', 'grUsuarios');

        function handleFile(files, configKey) {
    // Lista de funciones que solo pueden procesar un archivo a la vez
    const singleFileFunctions = [
        '901',  
        'zpptwc', 
        'coois'
    ];

    if (configKey === 'boxID') {
        // Esta función sí maneja múltiples archivos
        handleBoxIDFile(files);
    } else if (configKey === 'grUsuarios') {
        // Esta nueva función también manejará múltiples archivos
        handleGrUsuariosFile(files);
    } else if (singleFileFunctions.includes(configKey)) {
        // Para todas las demás, solo procesamos el PRIMER archivo de la lista
        const file = files[0];
        if (!file) return; // Si no hay archivo, no hacemos nada

        // Llamamos a la función correcta con UN SOLO archivo
        if (configKey === '901') handle901File(file);
        
        // Esta es la lógica original para los archivos de Terminaciones
        if (configKey === 'zpptwc' || configKey === 'coois') {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const mapping = (configKey === 'zpptwc') ? params.terminaciones_config.zpptwc_cols : params.terminaciones_config.coois_cols;
                    const sheetData = XLSX.utils.sheet_to_json(ws, { header: 'A', defval: null, range: 1 });
                    const data = sheetData.map(row => {
                        let rowData = {};
                        for (const map of mapping) {
                            if(map.excel_col) rowData[map.key] = row[map.excel_col];
                        }
                        return rowData;
                    }).filter(row => row.Orden);
                    reportData[configKey] = data;
                    doc(`fileDropArea${configKey.charAt(0).toUpperCase() + configKey.slice(1)}`).style.borderColor = '#4ade80';

                    if (configKey === 'coois') {
                        const batch = db.batch();
                        data.forEach(row => {
                            const orderId = String(row.Orden || '').replace(/^0+/, '');
                            if(orderId) {
                                const docRef = db.collection('coois_historico').doc(orderId);
                                batch.set(docRef, row, { merge: true });
                            }
                        });
                        await batch.commit();
                    }
                    processTerminacionesReport();
                } catch (err) {
                    console.error("Error al procesar archivo:", err);
                    showModal('Error de Archivo', '<p>No se pudo procesar el archivo Excel. Verifique el mapeo de letras de columna y la conexión a la base de datos.</p>');
                }
            };
            reader.readAsArrayBuffer(file);
        }
    }
}


        const formulaHelpers = {
            EXTRAER: (text, start, length) => (typeof text !== 'string' || text === null) ? '' : String(text).substring(start - 1, start - 1 + length),
            EXTRAER_FIBRAS: (text, start, length) => {
                if (typeof text !== 'string' || text === null) return 0;
                const code = String(text).substring(start - 1, start - 1 + length).toUpperCase();
                if (!code) return 0;
                switch (code) {
                    case '1': return 1; case '2': return 2; case '3': return 3; case '4': return 4;
                    case '5': return 5; case '6': return 6; case '7': return 7; case '8': return 8;
                    case '9': return 9; case 'A': return 1; case 'B': return 2; case 'C': return 4;
                    case 'D': return 6; case 'E': return 8; case 'F': return 12; case 'G': return 24;
                    case 'T': return 12; default: const num = parseFloat(code); return isNaN(num) ? 0 : num;
                }
            },
            IF: (condition, valueIfTrue, valueIfFalse) => condition ? valueIfTrue : valueIfFalse,
        };

        function excelSerialToDateObject(serial) {
            if (serial instanceof Date) return serial;
            if (typeof serial !== 'number' || isNaN(serial)) return null;
            const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
            return new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
        }

        function formatShortDateTime(date) {
            if (!(date instanceof Date) || isNaN(date)) return '';
            const year = date.getFullYear().toString().slice(-2); // Saca los últimos 2 dígitos del año
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year} ${hour}:${minute}`; // Formato: 14/10/25 08:00
        }

async function loadAreasForTarimasReport() {
    try {
        const areasSnapshot = await db.collection('areas').get();
        const areaSelect = doc('prodTarimas_area');
        // Guardar selección actual si existe, si no, seleccionar vacío
        const currentVal = areaSelect.value || "";
        // Limpiar opciones excepto la de "Cargando..." y "Todas"
        areaSelect.innerHTML = '<option value="" disabled>Seleccione área...</option><option value="ALL">Todas las Áreas</option>';

        let areas = [];
        areasSnapshot.forEach(doc => {
            if (doc.id !== 'CONFIG') { // Excluir documentos de configuración si los tienes
                areas.push(doc.id);
            }
        });
        areas.sort(); // Ordenar alfabéticamente

        areas.forEach(areaId => {
            const option = document.createElement('option');
            option.value = areaId;
            option.textContent = areaId;
            areaSelect.appendChild(option);
        });

        // Restaurar selección anterior o dejar "Seleccione área..."
        if (areaSelect.querySelector(`option[value="${currentVal}"]`)) {
             areaSelect.value = currentVal;
        } else {
             areaSelect.value = ""; // Forzar el placeholder si la opción ya no existe o era inválida
        }

    } catch (e) {
        console.error("[Áreas Tarimas] Error cargando áreas:", e);
        // Poner mensaje de error en el select
        const areaSelect = doc('prodTarimas_area');
        areaSelect.innerHTML = '<option value="" disabled selected>Error al cargar</option>';
    }
}       

// =======================================================================================
// --- INICIO: LÓGICA DEL DASHBOARD EN VIVO ---
// =======================================================================================

function showLiveDashboard() {
    // 1. Obtener la fecha y turno de TRABAJO actual
    const now = new Date();
    const { shift: turnoActual, dateKey: fechaDeTrabajoActual } = getWorkShiftAndDate(now);
    
    // 2. Calcular el rango de horas para ESE turno
    const { startTime } = getShiftDateRange(fechaDeTrabajoActual, turnoActual); 
    
    const areaALeer = "MULTIPORT"; 
    doc('liveTurnoTitle').textContent = `Turno: ${turnoActual} (${areaALeer})`;

    renderLiveChart({}, [], startTime); 
    switchView('liveDashboard'); 

    if (liveListener) {
        console.log("Deteniendo listener anterior...");
        liveListener();
        liveListener = null;
    }

    // Pre-calcular empacadores
    const allPackers = params.produccion_hora_config.packers || [];
    const empacadoresFiltrados = allPackers.filter(p => p.turno === turnoActual && (p.area === areaALeer || p.area === 'ALL'));
    const empacadoresPorLinea = new Map(); 
    empacadoresFiltrados.forEach(p => {
        const lineaNum = String(p.linea);
        if (!empacadoresPorLinea.has(lineaNum)) {
            empacadoresPorLinea.set(lineaNum, new Set());
        }
        empacadoresPorLinea.get(lineaNum).add(p.id);
    });
    
    // --- CORRECCIÓN AQUÍ: FRANCOTIRADOR AJUSTADO ---
    // En lugar de 48 horas, usamos la hora de inicio del turno menos 30 mins de colchón.
    const cutoffDate = new Date(startTime);
    cutoffDate.setMinutes(cutoffDate.getMinutes() - 30); 

    console.log(`📡 Listener VIVO: Buscando cambios desde ${cutoffDate.toLocaleTimeString()}`);
    
    liveListener = db.collection("areas").doc(areaALeer).collection("orders")
        .where('lastUpdated', '>=', cutoffDate) // <--- AHORA SÍ FILTRA CHIDO
        .onSnapshot(querySnapshot => {
            
            console.log(`¡Datos recibidos! ${querySnapshot.size} órdenes activas en este turno.`);
            let allOrders = [];
            querySnapshot.forEach(doc => {
                allOrders.push(doc.data());
            });
            
            updateLiveDashboard(allOrders, turnoActual, fechaDeTrabajoActual, startTime, empacadoresPorLinea);

        }, error => {
            console.error("¡Error en el listener en vivo!:", error);
            if (error.code === 'failed-precondition') {
                doc('liveFeedContent').innerHTML = `<p style="color:var(--warning-color);">⚠️ Falta Índice. Abre consola (F12).</p>`;
            } else {
                // doc('liveFeedContent').innerHTML = ... (Si tienes un div para errores)
            }
        });
}

function stopLiveDashboard() {
    if (liveListener) {
        console.log("Deteniendo listener en vivo...");
        liveListener(); // Esta función "apaga" el onSnapshot
        liveListener = null;
    }
    if (liveProductionChart) {
        liveProductionChart.destroy();
        liveProductionChart = null;
    }
}

// --- FUNCIÓN DE REEMPLAZO (updateLiveDashboard) ---
// --- FUNCIÓN DE REEMPLAZO (updateLiveDashboard) ---
function updateLiveDashboard(allOrders, turnoActual, fechaDeTrabajoActual, shiftStartTime, empacadoresPorLinea) {
    let allPackedItems = [];
    let lastScan = { timestamp: new Date(0), empacador: 'N/A', linea: 'N/A' };
    const totalsByLine = {};
    const hourlyBins = Array(12).fill(0).map(() => ({}));
    const lineasEncontradas = new Set();

    // 1. PROCESAR TODOS LOS DATOS (Sin cambios)
    allOrders.forEach(order => {
        const empaqueArray = order.empaqueData || []; 
        if (!Array.isArray(empaqueArray)) {
            if (typeof order.empaqueData.forEach === 'function') {
                order.empaqueData.forEach(serialsInBox => empaqueArray.push({ serials: serialsInBox }));
            } else {
                console.warn(`empaqueData de orden ${order.orderNumber} no es un array, saltando.`);
                return;
            }
        }
        
        empaqueArray.forEach(box => {
            const serialsInBox = box.serials;
            if (Array.isArray(serialsInBox)) {
                serialsInBox.forEach(item => {
                    const packedDate = excelSerialToDateObject(item['Finish Packed Date']);
                    if (!packedDate) return;

                    const { shift, dateKey } = getWorkShiftAndDate(packedDate);

                    if (shift === turnoActual && dateKey === fechaDeTrabajoActual) {
                        const empacador = (item['Employee ID'] || '').toString().toUpperCase();
                        let lineaAsignada = null;

                        for (const [lineaNum, setDeEmpacadores] of empacadoresPorLinea.entries()) {
                            if (setDeEmpacadores.has(empacador)) {
                                lineaAsignada = `Línea ${lineaNum}`;
                                break;
                            }
                        }

                        if (lineaAsignada) {
                            lineasEncontradas.add(lineaAsignada);
                            const char = (order.catalogNumber || '').substring(3, 4).toUpperCase();
                            const terminaciones = (char === 'T') ? 12 : (parseInt(char, 10) || 0);

                            if (!totalsByLine[lineaAsignada]) totalsByLine[lineaAsignada] = { term: 0, pzas: 0 };
                            totalsByLine[lineaAsignada].term += terminaciones;
                            totalsByLine[lineaAsignada].pzas++; // <-- ¡Aquí se cuentan las piezas!

                            const diffMillis = packedDate - shiftStartTime;
                            const hourIndex = Math.floor(diffMillis / (1000 * 60 * 60));
                            if (hourIndex >= 0 && hourIndex < 12) {
                                if (!hourlyBins[hourIndex][lineaAsignada]) hourlyBins[hourIndex][lineaAsignada] = 0;
                                hourlyBins[hourIndex][lineaAsignada] += terminaciones;
                            }

                            if (packedDate > lastScan.timestamp) {
                                lastScan = { timestamp: packedDate, empacador, linea: lineaAsignada };
                            }
                        }
                    }
                });
            }
        });
    });

    const lineasOrdenadas = [...lineasEncontradas].sort();

    // --- 2. ACTUALIZAR FEED DE ACTIVIDAD (AHORA DISCRETO) ---
    const lastScanEl = doc('liveChartLastScan'); // <-- ¡NUEVO! Apunta al span en la gráfica
    if (lastScan.timestamp > 0) {
        lastScanEl.innerHTML = `Último escaneo: ${lastScan.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (${lastScan.linea})`;
    } else {
        lastScanEl.innerHTML = `Esperando escaneo...`;
    }

    // --- 3. ACTUALIZAR TARJETAS (KPIs) ---
    const metaTurno = 5280; 
    const kpiContainer = doc('kpiCardContainer');
    let kpiHtml = ''; 

    lineasOrdenadas.forEach(lineaNombre => {
        const lineaNumero = lineaNombre.split(' ')[1];
        
        // --- ¡NUEVO! Obtenemos el total de piezas y terminaciones ---
        const totalTerm = (totalsByLine[lineaNombre] && totalsByLine[lineaNombre].term) ? totalsByLine[lineaNombre].term : 0;
        const totalPzas = (totalsByLine[lineaNombre] && totalsByLine[lineaNombre].pzas) ? totalsByLine[lineaNombre].pzas : 0;
        
        const percent = (totalTerm / metaTurno) * 100;
        let progressClass = 'progress-bar-red';
        if (percent >= 80) progressClass = 'progress-bar-green';
        else if (percent >= 40) progressClass = 'progress-bar-yellow';

        kpiHtml += `
            <div class="kpi-card" id="kpi-linea-${lineaNumero}">
                <div class="kpi-header">
                    <h4>${lineaNombre}</h4>
                    <span id="kpi-linea-${lineaNumero}-meta" class="kpi-meta">Meta: ${metaTurno.toLocaleString()}</span>
                </div>
                <h1 id="kpi-linea-${lineaNumero}-total">${totalTerm.toLocaleString()}</h1>
                <h4 id="kpi-linea-${lineaNumero}-piezas" class="kpi-piezas">${totalPzas.toLocaleString()} Piezas</h4>
                
                <div class="kpi-progress-bar-container">
                    <div id="kpi-linea-${lineaNumero}-progress" class="kpi-progress-bar ${progressClass}" style="width: ${Math.min(percent, 100)}%;"></div>
                </div>
                <span id="kpi-linea-${lineaNumero}-percent" class="kpi-percent">${percent.toFixed(1)}%</span>
            </div>
        `;
    });

    if (lineasOrdenadas.length === 0) {
        kpiContainer.innerHTML = `<p style="color: var(--text-secondary); text-align: center; width: 100%; grid-column: 1 / -1;">Esperando datos de producción para las líneas...</p>`;
    } else {
        kpiContainer.innerHTML = kpiHtml;
    }

    // --- 4. ACTUALIZAR GRÁFICA DE BARRAS (Sin cambios) ---
    renderLiveChart(hourlyBins, lineasOrdenadas, shiftStartTime);
}

// --- FUNCIÓN DE REEMPLAZO (renderLiveChart) ---
function renderLiveChart(hourlyData, lineasOrdenadas, shiftStartTime) {
    const canvas = doc('liveProduccionChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Lógica de Metas (Sin cambios)
    const goals = Array(12).fill(480);
    goals[1] = 360; goals[5] = 280; goals[8] = 360; 
    const visualGoalLine = Array(12).fill(480);

    // Destruir chart viejo (Sin cambios)
    if (liveProductionChart) {
        liveProductionChart.destroy();
        liveProductionChart = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height); 

    // 1. Crear Etiquetas (Sin cambios)
    const labels = [];
    const startTime = (shiftStartTime instanceof Date) ? shiftStartTime : new Date(shiftStartTime);
    
    if (isNaN(startTime.getTime())) {
        console.error("Error Crítico: La fecha de inicio (startTime) es inválida.", shiftStartTime);
        for (let i = 0; i < 12; i++) labels.push('Error Fecha');
    } else {
        for (let i = 0; i < 12; i++) {
            const start = new Date(startTime.getTime());
            start.setHours(start.getHours() + i);
            const end = new Date(start.getTime());
            end.setHours(end.getHours() + 1);
            const format = { hour: '2-digit', minute: '2-digit', hour12: false };
            labels.push(`${start.toLocaleTimeString([], format)} - ${end.toLocaleTimeString([], format)}`);
        }
    }

    // 2. Crear Datasets (Sin cambios)
    const colors = ['rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)', 'rgba(75, 192, 192, 0.6)', 'rgba(255, 206, 86, 0.6)', 'rgba(153, 102, 255, 0.6)'];
    const borderColors = ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)', 'rgba(255, 206, 86, 1)', 'rgba(153, 102, 255, 1)'];
    
    const dynamicDatasets = lineasOrdenadas.map((linea, index) => {
        return {
            label: linea,
            data: labels.map((_, i) => (hourlyData[i] && hourlyData[i][linea]) ? hourlyData[i][linea] : 0),
            backgroundColor: colors[index % colors.length],
            borderColor: borderColors[index % borderColors.length],
            borderWidth: 1,
            order: 1
        };
    });
    
    dynamicDatasets.unshift({ 
        type: 'line', 
        label: 'Meta', 
        data: visualGoalLine,
        borderColor: getComputedStyle(document.body).getPropertyValue('--success-color'), 
        borderWidth: 2, 
        borderDash: [5, 5], 
        pointRadius: 0, 
        fill: false, 
        order: 0
    });
    
    // 3. Crear Gráfica
    liveProductionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: dynamicDatasets
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: 'var(--text-primary)', filter: item => item.datasetIndex > 0 } }, 
                title: { 
                    display: true, 
                    text: 'Producción por Hora (En Vivo)',
                    color: 'var(--text-primary)', 
                    font: { size: 16 } 
                },
                datalabels: {
                    display: context => context.dataset.type !== 'line',
                    labels: {
                        value: {
                            anchor: 'end', 
                            align: 'top',
                            offset: 5,
                            backgroundColor: (ctx) => {
                                const isSuccess = ctx.dataset.data[ctx.dataIndex] >= goals[ctx.dataIndex]; 
                                const colorVar = isSuccess ? '--glow-green' : '--glow-red';
                                const rawColor = getComputedStyle(document.body).getPropertyValue(colorVar).trim();
                                return rawColor.replace(/0.9\)$/, '0.4)');
                            },
                            borderColor: (ctx) => {
                                return ctx.dataset.data[ctx.dataIndex] >= goals[ctx.dataIndex] ? getComputedStyle(document.body).getPropertyValue('--success-color') : getComputedStyle(document.body).getPropertyValue('--danger-color');
                            },
                            borderWidth: 1,
                            borderRadius: 4,
                            color: 'white',
                            font: { weight: 'bold' },
                            padding: { top: 2, bottom: 2, left: 5, right: 5 },
                            formatter: (value) => value > 0 ? value.toLocaleString() : '',
                        },
                        percentage: { 
                            align: 'center', anchor: 'center',
                            color: (ctx) => {
                                const barHeight = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex].height;
                                return barHeight > 18 ? 'rgba(255, 255, 255, 0.9)' : 'transparent';
                            },
                            font: { weight: 'bold', size: 11 },
                            formatter: (value, ctx) => {
                                const goalForHour = goals[ctx.dataIndex];
                                if (value <= 0 || goalForHour === 0) return '';
                                const percentage = (value / goalForHour) * 100;
                                return percentage.toFixed(0) + '%';
                            },
                            textStrokeColor: 'rgba(0,0,0,0.6)',
                            textStrokeWidth: 2
                        }
                    }
                }
            },
            scales: {
                x: { 
                    grid: { color: 'var(--chart-grid-color)' }, 
                    ticks: { color: 'var(--chart-tick-color)', maxRotation: 0, minRotation: 0, autoSkip: true, font: { size: 10 } },
                    categoryPercentage: 0.7,
                    barPercentage: 0.9
                },
                y: { 
                    beginAtZero: true, 
                    grid: { 
                        color: 'var(--chart-grid-color)',
                        // --- ¡AQUÍ ESTÁ EL ARREGLO DE LA CUADRÍCULA! ---
                        drawOnChartArea: false 
                    }, 
                    ticks: { color: 'var(--chart-tick-color)' }, 
                    title: { display: true, text: 'Total de Terminaciones', color: 'var(--chart-tick-color)' },
                    afterDataLimits: (scale) => {
                        scale.max = scale.max * 1.2;
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });

    updateChartTheme();
}

// =======================================================================================
// --- FIN: LÓGICA DEL DASHBOARD EN VIVO ---
// =======================================================================================

        async function handleBoxIDFile(files) {
    if (!files || files.length === 0) return;
    
    showModal('Procesando...', `<p>Cargando ${files.length} archivo(s). Por favor, espere...</p>`);

    const processSingleFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    
                    // --- ¡AQUÍ ESTÁ EL AJUSTE CLAVE! ---
                    // Cambia este número. Si tus datos (no el encabezado) empiezan en la fila 2 de Excel, pones 1.
                    // Si empiezan en la fila 3, pones 2, y así.
                    const filaDeInicio = 1; // <--- ¡¡¡CAMBIA ESTE NÚMERO!!!

                    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, range: filaDeInicio });
                    
                    const dataInFile = jsonData
                        .map(row => ({
                            boxId: row[9],  // Columna J
                            gr: row[0],       // Columna A
                            receivedDate: row[6] // Columna G
                        }))
                        .filter(item => item.boxId !== undefined && item.boxId !== null && String(item.boxId).trim() !== '');
                    
                    resolve(dataInFile);
                } catch (err) {
                    console.error(`Error procesando el archivo ${file.name}:`, err);
                    reject(`No se pudo leer el archivo ${file.name}.`);
                }
            };
            reader.onerror = () => reject(`Error al leer el archivo ${file.name}.`);
            reader.readAsArrayBuffer(file);
        });
    };

    try {
        const results = await Promise.all(Array.from(files).map(processSingleFile));
        const allData = results.flat();

        if (allData.length === 0) {
            showModal('Sin Datos', '<p>No se encontraron BoxIDs válidos en la columna J de los archivos seleccionados.</p>');
            return;
        }

        const batch = db.batch();
        const uniqueData = new Map();
        allData.forEach(item => {
            uniqueData.set(String(item.boxId).trim(), item);
        });

        uniqueData.forEach((data, boxId) => {
            const docRef = db.collection('boxID_historico').doc(boxId);
            
            const receivedAtDate = data.receivedDate ? excelSerialToDateObject(data.receivedDate) : new Date();

            const dataToSave = {
                gr: data.gr || 'N/A',
                receivedAt: receivedAtDate 
            };
            batch.set(docRef, dataToSave, { merge: true });
        });

        await batch.commit();

        doc('fileDropAreaBoxID').style.borderColor = 'var(--success-color)';
        showModal('Éxito', `<p>Proceso completado. Se han guardado/actualizado <strong>${uniqueData.size}</strong> registros únicos de <strong>${files.length}</strong> archivo(s).</p>`);

    } catch (err) {
        console.error("Error en el procesamiento de múltiples archivos:", err);
        doc('fileDropAreaBoxID').style.borderColor = 'var(--danger-color)';
        showModal('Error de Archivo', `<p>${err}</p>`);
    }
}
        
        async function handleGrUsuariosFile(files) {
    if (!files || files.length === 0) return;
    showModal('Procesando...', `<p>Cargando ${files.length} archivo(s) de usuarios...</p>`);

    const processSingleFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1 });
                    
                    const dataInFile = jsonData
                        .map(row => ({
                            gr: row[1],       // Columna B (índice 1)
                            orden: row[5],    // Columna F (índice 5)
                            usuario: row[8]   // Columna I (índice 8)
                        }))
                        .filter(item => item.gr && String(item.gr).trim() !== '');
                    resolve(dataInFile);
                } catch (err) { reject(`Error al leer ${file.name}.`); }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    try {
        const results = await Promise.all(Array.from(files).map(processSingleFile));
        const allData = results.flat();

        if (allData.length === 0) {
            showModal('Sin Datos', '<p>No se encontró información de GR válida en los archivos seleccionados.</p>');
            return;
        }

        const batch = db.batch();
        // Usamos un Map para quedarnos con el último registro de un GR si viniera repetido
        const grDataMap = new Map();
        allData.forEach(item => {
            grDataMap.set(String(item.gr).trim(), {
                usuario: item.usuario || 'N/A',
                orden: item.orden || 'N/A'
            });
        });

        // AHORA SÍ: Simplemente guardamos cada GR en la nueva colección 'gr_historico'
        grDataMap.forEach((data, gr) => {
            const docRef = db.collection('gr_historico').doc(gr);
            batch.set(docRef, data, { merge: true });
        });

        await batch.commit();

        doc('fileDropAreaGrUsuarios').style.borderColor = 'var(--success-color)';
        showModal('Éxito', `<p>Proceso completado. Se han guardado <strong>${grDataMap.size}</strong> registros de GR únicos.</p>`);

    } catch (err) {
        console.error("Error en el procesamiento de archivos GR Usuarios:", err);
        doc('fileDropAreaGrUsuarios').style.borderColor = 'var(--danger-color)';
        showModal('Error', `<p>${err.message || err}</p>`);
    }
}
        

        function renderGraficaSemanalProduccion(datos, labels) {
    const ctx = doc('produccionSemanalChart').getContext('2d');
    if (weeklyProductionChart) {
        weeklyProductionChart.destroy();
    }

    const meta = 5280;

    weeklyProductionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(f =>
                new Date(f + 'T00:00:00').toLocaleDateString('es-MX', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                })
            ),
            datasets: [
                {
                    label: 'Línea 1',
                    data: labels.map(fecha => datos[fecha]['Línea 1'].term),
                    backgroundColor: 'rgba(245, 158, 11, 0.8)', // <-- ¡ÁMBAR / DORADO!
                },
                {
                    label: 'Línea 2',
                    data: labels.map(fecha => datos[fecha]['Línea 2'].term),
                    backgroundColor: 'rgba(16, 185, 129, 0.8)', // <-- ¡VERDE ESMERALDA!
                },
                {
                    type: 'line',
                    label: 'Meta',
                    data: Array(labels.length).fill(meta),
                    borderColor: 'var(--success-color)',
                    borderWidth: 2,
                    // borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    datalabels: { display: false } 
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: 'var(--chart-tick-color)' },
                    grid: { color: 'var(--chart-grid-color)' }
                },
                x: {
                    ticks: { color: 'var(--chart-tick-color)' },
                    grid: { color: 'var(--chart-grid-color)' }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: 'var(--text-primary)' }
                },
                datalabels: {
                    // --- Solo mostrar etiquetas en las barras, no en la línea ---
                    display: (context) => context.dataset.type !== 'line',
                    labels: {
                        terminaciones: {
                            anchor: 'end',
                            align: 'top',
                            formatter: (value) => value > 0 ? value.toLocaleString('es-MX') : '',
                            color: 'var(--text-primary)',
                            font: { weight: 'bold' }
                        },
                        eficiencia: {
                            anchor: 'center',
                            align: 'center',
                            formatter: (value, context) => {
                                if (context.dataset.type === 'line' || value === 0) return '';
                                const percentage = ((value / meta) * 100).toFixed(0) + '%';
                                return percentage;
                            },
                            // Colores y estilo adaptativos
                            color: (context) => {
                                const isLightTheme = document.body.classList.contains('light-theme');
                                const barHeight = context.chart
                                    .getDatasetMeta(context.datasetIndex)
                                    .data[context.dataIndex].height;
                                if (barHeight < 20) return 'transparent';
                                return isLightTheme
                                    ? '#111827'
                                    : 'rgba(255, 255, 255, 0.9)';
                            },
                            font: { weight: 'bold', size: 14 },
                            textStrokeColor: (context) => {
                                const isLightTheme = document.body.classList.contains('light-theme');
                                return isLightTheme
                                    ? 'rgba(255,255,255,0.6)'
                                    : 'rgba(0,0,0,0.6)';
                            },
                            textStrokeWidth: 2
                        }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });

    updateChartTheme();
}
        
        function getWorkShiftAndDate(date) {
            const hour = date.getHours();
            const minute = date.getMinutes();

            let workDate = new Date(date.getTime());

            if (hour < 6 || (hour === 6 && minute < 30)) {
                workDate.setDate(workDate.getDate() - 1);
            }

            const year = workDate.getFullYear();
            const month = String(workDate.getMonth() + 1).padStart(2, '0');
            const dayOfMonth = String(workDate.getDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${dayOfMonth}`;
            
            const referenceDate = new Date('2025-10-06T00:00:00');
            const diffTime = workDate.getTime() - referenceDate.getTime();
            const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
            const isShortWeek = diffWeeks % 2 === 0;

            const workDay = workDate.getDay();

            const isDayTime = (hour > 6 || (hour === 6 && minute >= 30)) && (hour < 18 || (hour === 18 && minute < 30));

            let shift;

            if (isShortWeek) {
                if (workDay >= 1 && workDay <= 3) {
                    shift = isDayTime ? 'T45' : 'T46';
                } else {
                    shift = isDayTime ? 'T47' : 'T48';
                }
            } else {
                if (workDay >= 1 && workDay <= 4) {
                    shift = isDayTime ? 'T45' : 'T46';
                } else {
                    shift = isDayTime ? 'T47' : 'T48';
                }
            }

            return {
                shift: shift,
                dateKey: dateKey 
            };
        }
        
        

        // --- INICIO: LÓGICA REPORTE DE PRODUCCIÓN POR HORA ---
        function getAutoCurrentShift() {
            const now = new Date();

            const referenceDate = new Date('2025-10-06T00:00:00');
            const diffTime = now.getTime() - referenceDate.getTime();
            const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
            const isShortWeek = diffWeeks % 2 === 0;

            let day = now.getDay();
            const hour = now.getHours();
            const minute = now.getMinutes();

            if (hour < 6 || (hour === 6 && minute < 30)) {
                day = (day === 0) ? 6 : day - 1;
            }

            const isDayTime = hour >= 6 && (hour < 18 || (hour === 18 && minute < 30));

            if (isShortWeek) {
                if (day >= 1 && day <= 3) {
                    return isDayTime ? 'T45' : 'T46';
                } else {
                    return isDayTime ? 'T47' : 'T48';
                }
            } else {
                if (day >= 1 && day <= 4) {
                    return isDayTime ? 'T45' : 'T46';
                } else {
                    return isDayTime ? 'T47' : 'T48';
                }
            }
        }

        function getShiftDateRange(selectedDateStr, selectedShift) {
            const date = new Date(`${selectedDateStr}T00:00:00`);
            let startTime, endTime;
            switch(selectedShift) {
                case 'T45': case 'T47':
                    startTime = new Date(date.getTime()); startTime.setHours(6, 30, 0, 0);
                    endTime = new Date(date.getTime()); endTime.setHours(18, 29, 59, 999);
                    break;
                case 'T46': case 'T48':
                    startTime = new Date(date.getTime()); startTime.setHours(18, 30, 0, 0);
                    endTime = new Date(date.getTime()); endTime.setDate(endTime.getDate() + 1);
                    endTime.setHours(6, 29, 59, 999);
                    break;
            }
            return { startTime, endTime };
        }

        doc('generarReporteProduccionBtn').addEventListener('click', generateProductionReport);
        doc('exportChartBtn').addEventListener('click', exportChartAsJPG);
        doc('exportarSemanalBtn').addEventListener('click', exportarSemanalComoJPG);

        function hideAllProductionViews() {
            doc('chartContainer').style.display = 'none';
            doc('fibraReportContainer').style.display = 'none';
            doc('semanalContainer').style.display = 'none';
            doc('produccionTablesGrid').style.display = 'none';
        }

        doc('showProduccionHoraBtn').addEventListener('click', () => {
            hideAllProductionViews();
            doc('fechaUnicaContainer').style.display = 'block';
            doc('fechaRangoContainer').style.display = 'none';
            doc('chartContainer').style.display = 'flex';
            doc('produccionTablesGrid').style.display = 'grid';
            doc('generarReporteProduccionBtn').textContent = 'Generar Reporte por Hora';
        });

        doc('showProduccionFibraBtn').addEventListener('click', () => {
            if (!productionReportData) {
                showModal('Datos no disponibles', '<p>Primero debe generar un reporte de producción por hora.</p>');
                return;
            }
            hideAllProductionViews();
            doc('fechaUnicaContainer').style.display = 'block';
            doc('fechaRangoContainer').style.display = 'none';
            renderFiberReport(productionReportData);
            doc('fibraReportContainer').style.display = 'flex';
            doc('generarReporteProduccionBtn').textContent = 'Generar Reporte por Hora';
        });
        
        doc('showProduccionSemanaBtn').addEventListener('click', () => {
            hideAllProductionViews();
            doc('fechaUnicaContainer').style.display = 'none';
            doc('fechaRangoContainer').style.display = 'block';
            doc('semanalContainer').style.display = 'flex';
            doc('generarReporteProduccionBtn').textContent = 'Generar Reporte Semanal';
            if (weeklyProductionChart) weeklyProductionChart.destroy();
            doc('resumenSemanal').innerHTML = '<h4 style="text-align:center;">Configure filtros y presione "Generar Reporte".</h4>';
        });

    async function loadAreasForProductionReport() {
            try {
                const areasSnapshot = await db.collection('areas').get();
                const areaSelect = doc('prod_area');
                const currentVal = areaSelect.value;
                const existingOptions = new Set(Array.from(areaSelect.options).map(o => o.value));
                let areas = [];
                areasSnapshot.forEach(doc => { if (doc.id !== 'CONFIG') areas.push(doc.id); });
                areas.sort();
                areas.forEach(areaId => {
                    if (!existingOptions.has(areaId)) {
                        const option = document.createElement('option');
                        option.value = areaId; option.textContent = areaId;
                        areaSelect.appendChild(option);
                    }
                });
                areaSelect.value = currentVal;
            } catch (e) { console.error("Error cargando áreas:", e); }
        }


        async function generateProductionReport() {
            if (doc('semanalContainer').style.display === 'flex') {
                await generarReporteSemanalProduccion();
            } else {
                await generarReportePorHora();
            }
        }

       async function generarReportePorHora() {
    const btn = doc('generarReporteProduccionBtn');
    btn.disabled = true; btn.textContent = 'Analizando actividad reciente...';
    doc('exportChartBtn').style.display = 'none';
    const tablesGrid = doc('produccionTablesGrid');
    tablesGrid.innerHTML = '';

    try {
        const selectedDateStr = doc('prod_fecha_unica').value;
        const selectedTurno = doc('prod_turno').value;
        const selectedArea = doc('prod_area').value;
        
        if (!selectedDateStr) { showModal('Error', '<p>Por favor, selecciona una fecha.</p>'); return; }

        // 1. OBTENER RANGO DE TIEMPO DEL TURNO
        const { startTime, endTime } = getShiftDateRange(selectedDateStr, selectedTurno);

        // 2. CONFIGURACIÓN DE EMPACADORES
        const todosLosEmpacadores = params.produccion_hora_config.packers || [];
        const empacadoresFiltrados = todosLosEmpacadores.filter(p => 
            (p.area === selectedArea || selectedArea === 'ALL' || p.area === 'ALL') && p.turno === selectedTurno
        );

        if (empacadoresFiltrados.length === 0) {
            showModal('Sin Empacadores', '<p>No hay empacadores configurados para este turno/área.</p>');
            renderProductionChart([], null, selectedTurno);
            return;
        }

        const empacadoresPorLinea = new Map();
        empacadoresFiltrados.forEach(p => {
            const lineaNum = String(p.linea);
            if (!empacadoresPorLinea.has(lineaNum)) empacadoresPorLinea.set(lineaNum, new Set());
            empacadoresPorLinea.get(lineaNum).add(p.id);
        });

        // 3. CONSULTA INTELIGENTE
        // Usamos la hora de inicio del turno - 1 hora como buffer
        const bufferDate = new Date(startTime);
        bufferDate.setHours(bufferDate.getHours() - 1);

        console.log(`[Producción] Consultando cambios desde: ${bufferDate.toLocaleString()}`);

        let query = selectedArea === 'ALL' ? db.collectionGroup('orders') : db.collection('areas').doc(selectedArea).collection('orders');
        
        // Filtro por fecha de actualización
        query = query.where('lastUpdated', '>=', bufferDate);

        const snapshot = await query.get();
        console.log(`[Producción] Descargadas: ${snapshot.size} órdenes (potencialmente activas).`);

        // 4. PROCESAR DATOS
        let allPackedItems = [];
        let validOrdersCount = 0; // Contador para ver cuántas sí sirvieron

        if (!snapshot.empty) {
            snapshot.forEach(orderDoc => {
                const orderData = orderDoc.data();
                let orderHasValidData = false;

                if (Array.isArray(orderData.empaqueData)) {
                    orderData.empaqueData.forEach(box => {
                        if (Array.isArray(box.serials)) {
                            box.serials.forEach(item => {
                                const packedDate = excelSerialToDateObject(item['Finish Packed Date']);
                                // Filtro exacto de hora (AQUÍ ES DONDE SE DESCARTAN LAS SOBRANTES)
                                if (packedDate && packedDate >= startTime && packedDate <= endTime) {
                                    const empacador = (item['Employee ID'] || '').toString().toUpperCase();
                                    let lineaAsignada = null;
                                    for (const [linea, setDeEmpacadores] of empacadoresPorLinea.entries()) {
                                        if (setDeEmpacadores.has(empacador)) {
                                            lineaAsignada = linea;
                                            break;
                                        }
                                    }
                                    if (lineaAsignada) {
                                        orderHasValidData = true;
                                        allPackedItems.push({
                                            orden: orderDoc.id, catalogo: orderData.catalogNumber || 'N/A',
                                            empacador: empacador, timestamp: packedDate,
                                            linea: `Línea ${lineaAsignada}`,
                                            boxId: box.boxId || 'SIN_CAJA'
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
                if (orderHasValidData) validOrdersCount++;
            });
        }
        
        console.log(`[Producción] De las ${snapshot.size} descargadas, solo ${validOrdersCount} tenían datos reales para este turno.`);

        // ... (El resto del procesamiento sigue igual)
        const detailedData = allPackedItems.map(item => {
            const char = (item.catalogo || '').substring(3, 4).toUpperCase();
            const fibras = (char === 'T') ? 12 : (parseInt(char, 10) || 0);
            return { ...item, fibras, terminaciones: fibras };
        });
        productionReportData = detailedData;
        
        const groupedByBox = new Map();
        detailedData.forEach(item => {
            const key = `${item.orden}-${item.boxId}`;
            if (!groupedByBox.has(key)) groupedByBox.set(key, { ...item, piezas: 0, terminaciones: 0 });
            const group = groupedByBox.get(key);
            group.piezas++; group.terminaciones += item.terminaciones;
            if (item.timestamp > group.timestamp) group.timestamp = item.timestamp;
async function generarReportePorHora() {
   const btn = doc('generarReporteProduccionBtn');
   btn.disabled = true; btn.textContent = 'Analizando actividad reciente...';
   doc('exportChartBtn').style.display = 'none';
   const tablesGrid = doc('produccionTablesGrid');
   tablesGrid.innerHTML = '';

   try {
       const selectedDateStr = doc('prod_fecha_unica').value;
       const selectedTurno = doc('prod_turno').value;
       const selectedArea = doc('prod_area').value;

       if (!selectedDateStr) { showModal('Error', '<p>Por favor, selecciona una fecha.</p>'); return; }

       // 1. OBTENER RANGO DE TIEMPO DEL TURNO
       const { startTime, endTime } = getShiftDateRange(selectedDateStr, selectedTurno);

       // 2. CONFIGURACIÓN DE EMPACADORES
       const todosLosEmpacadores = params.produccion_hora_config.packers || [];
       const empacadoresFiltrados = todosLosEmpacadores.filter(p =>
           (p.area === selectedArea || selectedArea === 'ALL' || p.area === 'ALL') && p.turno === selectedTurno
       );

       if (empacadoresFiltrados.length === 0) {
           showModal('Sin Empacadores', '<p>No hay empacadores configurados para este turno/área.</p>');
           renderProductionChart([], null, selectedTurno);
           return;
       }

       const empacadoresPorLinea = new Map();
       empacadoresFiltrados.forEach(p => {
           const lineaNum = String(p.linea);
           if (!empacadoresPorLinea.has(lineaNum)) empacadoresPorLinea.set(lineaNum, new Set());
           empacadoresPorLinea.get(lineaNum).add(p.id);
       });

       // 3. CONSULTA INTELIGENTE
       const bufferDate = new Date(startTime);
       bufferDate.setHours(bufferDate.getHours() - 1);

       console.log(`[Producción] Consultando cambios desde: ${bufferDate.toLocaleString()}`);

       let query = selectedArea === 'ALL' ? db.collectionGroup('orders') : db.collection('areas').doc(selectedArea).collection('orders');
       query = query.where('lastUpdated', '>=', bufferDate);

       const snapshot = await query.get();
       console.log(`[Producción] Descargadas: ${snapshot.size} órdenes (potencialmente activas).`);

       // 4. PROCESAR DATOS
       let allPackedItems = [];
       let validOrdersCount = 0;

       if (!snapshot.empty) {
           snapshot.forEach(orderDoc => {
               const orderData = orderDoc.data();
               let orderHasValidData = false;

               if (Array.isArray(orderData.empaqueData)) {
                   orderData.empaqueData.forEach(box => {
                       if (Array.isArray(box.serials)) {
                           box.serials.forEach(item => {
                               const packedDate = excelSerialToDateObject(item['Finish Packed Date']);
                               if (packedDate && packedDate >= startTime && packedDate <= endTime) {
                                   const empacador = (item['Employee ID'] || '').toString().toUpperCase();
                                   let lineaAsignada = null;
                                   for (const [linea, setDeEmpacadores] of empacadoresPorLinea.entries()) {
                                       if (setDeEmpacadores.has(empacador)) {
                                           lineaAsignada = linea;
                                           break;
                                       }
                                   }
                                   if (lineaAsignada) {
                                       orderHasValidData = true;
                                       allPackedItems.push({
                                           orden: orderDoc.id, catalogo: orderData.catalogNumber || 'N/A',
                                           empacador: empacador, timestamp: packedDate,
                                           linea: `Línea ${lineaAsignada}`,
                                           boxId: box.boxId || 'SIN_CAJA'
                                       });
                                   }
                               }
                           });
                       }
                   });
               }
               if (orderHasValidData) validOrdersCount++;
           });
       }

       console.log(`[Producción] De las ${snapshot.size} descargadas, solo ${validOrdersCount} tenían datos reales para este turno.`);

       // --- AQUÍ ESTÁ EL CAMBIO CLAVE: CÁLCULO DINÁMICO ---
       const detailedData = allPackedItems.map(item => {
           // Usamos la función global pasando el área seleccionada para leer la configuración correcta
           const fibras = calculateTerminaciones(item.catalogo, selectedArea);
           return { ...item, fibras, terminaciones: fibras };
       });

       productionReportData = detailedData;

       const groupedByBox = new Map();
       detailedData.forEach(item => {
           const key = `${item.orden}-${item.boxId}`;
           if (!groupedByBox.has(key)) groupedByBox.set(key, { ...item, piezas: 0, terminaciones: 0 });
           const group = groupedByBox.get(key);
           group.piezas++; group.terminaciones += item.terminaciones;
           if (item.timestamp > group.timestamp) group.timestamp = item.timestamp;
       });
       const aggregatedData = Array.from(groupedByBox.values()).sort((a, b) => b.timestamp - a.timestamp);

       const datosPorLinea = new Map();
       aggregatedData.forEach(row => {
           const lineaNombre = row.linea;
           if (!lineaNombre) return;
           if (!datosPorLinea.has(lineaNombre)) datosPorLinea.set(lineaNombre, []);
           datosPorLinea.get(lineaNombre).push(row);
       });

       const lineasConDatos = [...datosPorLinea.keys()].sort();

       if (lineasConDatos.length === 0) {
           showModal('Sin Producción', '<p>No se encontró producción registrada en el periodo seleccionado.</p>');
           tablesGrid.innerHTML = '';
           renderProductionChart([], startTime, selectedTurno);
           productionReportData = [];
           return;
       }

       tablesGrid.style.gridTemplateColumns = `repeat(${lineasConDatos.length}, 1fr)`;
       lineasConDatos.forEach(lineaNombre => {
           const lineaNumero = lineaNombre.split(' ')[1];
           const tableId = `dataTableProduccionL${lineaNumero}`;
           tablesGrid.insertAdjacentHTML('beforeend', `<div class="card table-container"><h5>Producción ${lineaNombre}</h5><div class="table-wrapper"><table id="${tableId}"><thead><tr><th>Cargando...</th></tr></thead><tbody></tbody></table></div></div>`);
       });

       for (const [lineaNombre, data] of datosPorLinea.entries()) {
           const lineaNumero = lineaNombre.split(' ')[1];
           renderProductionTable(data, `dataTableProduccionL${lineaNumero}`, lineaNombre);
       }

       renderProductionChart(detailedData, startTime, selectedTurno);

   } catch (e) {
       console.error("Error report hourly:", e);
       if (e.code === 'failed-precondition') {
            showModal('Falta Índice', '<p>Firebase requiere un índice para esta consulta optimizada. Abre la consola (F12) y haz clic en el enlace.</p>', 'warning');
       } else {
            showModal('Error', `<p>${e.message}</p>`);
       }
       productionReportData = null;
   } finally {
       btn.disabled = false; btn.textContent = 'Generar Reporte';
   }
}
    // --- OPTIMIZACIÓN 4: REPORTE SEMANAL (FILTRO LASTUPDATED) ---
async function generarReporteSemanalProduccion() {
   const btn = doc('generarReporteProduccionBtn');
   btn.disabled = true; btn.textContent = 'Procesando semana...';

   try {
       const fechaInicioStr = doc('prod_fecha_inicio').value;
       const fechaFinStr = doc('prod_fecha_fin').value;
       const selectedArea = doc('prod_area').value;
       const selectedTurno = doc('prod_turno').value;

       if (!fechaInicioStr || !fechaFinStr) { showModal('Error', '<p>Faltan fechas.</p>'); return; }

       const queryStartTime = new Date(`${fechaInicioStr}T06:30:00`);
       queryStartTime.setDate(queryStartTime.getDate() - 1);

       const queryEndTime = new Date(`${fechaFinStr}T00:00:00`);
       queryEndTime.setDate(queryEndTime.getDate() + 1);
       queryEndTime.setHours(6, 29, 59, 999);

       let query = selectedArea === 'ALL' ? db.collectionGroup('orders') : db.collection('areas').doc(selectedArea).collection('orders');

       const bufferDate = new Date(queryStartTime);
       bufferDate.setDate(bufferDate.getDate() - 1);

       query = query.where('lastUpdated', '>=', bufferDate);

       const snapshot = await query.get();
       console.log(`[Semanal] Órdenes activas en la semana: ${snapshot.size}`);

       if (snapshot.empty) {
           showModal('Sin Datos', '<p>No hubo actividad en este periodo.</p>');
           renderGraficaSemanalProduccion({}, []);
           renderResumenSemanalProduccion({ 'Línea 1': { term: 0, pzas: 0 }, 'Línea 2': { term: 0, pzas: 0 } }, 0);
           return;
       }

       const empacadoresFiltrados = (params.produccion_hora_config.packers || []).filter(p =>
           (p.area === selectedArea || selectedArea === 'ALL') && p.turno === selectedTurno
       );
       const empacadoresL1 = empacadoresFiltrados.filter(p => p.linea === '1').map(p => p.id);
       const empacadoresL2 = empacadoresFiltrados.filter(p => p.linea === '2').map(p => p.id);

       let datosAgrupadosPorDia = {};
       let totales = { 'Línea 1': { term: 0, pzas: 0 }, 'Línea 2': { term: 0, pzas: 0 } };

       snapshot.forEach(orderDoc => {
           const orderData = orderDoc.data();
           if (Array.isArray(orderData.empaqueData)) {
               orderData.empaqueData.forEach(box => {
                   if (Array.isArray(box.serials)) {
                       box.serials.forEach(item => {
                           const packedDate = excelSerialToDateObject(item['Finish Packed Date']);
                           if (packedDate) {
                               const { shift, dateKey } = getWorkShiftAndDate(packedDate);
                               const esTurnoValido = (selectedTurno === shift);
                               const esFechaValida = dateKey >= fechaInicioStr && dateKey <= fechaFinStr;

                               if (esTurnoValido && esFechaValida) {
                                   const empacador = (item['Employee ID'] || '').toString().toUpperCase();
                                   let linea = null;
                                   if (empacadoresL1.includes(empacador)) linea = 'Línea 1';
                                   else if (empacadoresL2.includes(empacador)) linea = 'Línea 2';

                                   if (linea) {
                                       // --- AQUÍ ESTÁ EL CAMBIO CLAVE: CÁLCULO DINÁMICO ---
                                       const catalogo = orderData.catalogNumber || '';
                                       // Usamos la función global pasando el área seleccionada
                                       const terminaciones = calculateTerminaciones(catalogo, selectedArea);

                                       if (!datosAgrupadosPorDia[dateKey]) {
                                           datosAgrupadosPorDia[dateKey] = { 'Línea 1': { term: 0, pzas: 0 }, 'Línea 2': { term: 0, pzas: 0 } };
                                       }
                                       datosAgrupadosPorDia[dateKey][linea].term += terminaciones;
                                       datosAgrupadosPorDia[dateKey][linea].pzas++;
                                       totales[linea].term += terminaciones;
                                       totales[linea].pzas++;
                                   }
                               }
                           }
                       });
                   }
               });
           }
       });

       const labelsFechas = Object.keys(datosAgrupadosPorDia).sort();
       renderGraficaSemanalProduccion(datosAgrupadosPorDia, labelsFechas);
       renderResumenSemanalProduccion(totales, labelsFechas.length);

   } catch (e) {
       console.error("Error semanal:", e);
       if (e.code === 'failed-precondition') {
            showModal('Falta Índice', '<p>Crea el índice en Firebase (ver consola).</p>', 'warning');
       } else {
            showModal('Error', `<p>${e.message}</p>`);
       }
   } finally {
       btn.disabled = false; btn.textContent = 'Generar Reporte';
   }
}

        function renderResumenSemanalProduccion(totales, diasTrabajados) {
    const container = doc('resumenSemanal');
    const metaDiaria = 5280;
    const metaTotal = metaDiaria * diasTrabajados;

    const eficienciaL1 = metaTotal > 0 ? ((totales['Línea 1'].term / metaTotal) * 100) : 0;
    const eficienciaL2 = metaTotal > 0 ? ((totales['Línea 2'].term / metaTotal) * 100) : 0;

    const alturaBarraL1 = Math.min(eficienciaL1, 100);
    const alturaBarraL2 = Math.min(eficienciaL2, 100);

    container.innerHTML = `
        <h4 style="text-align: center; margin-top: 0;">Resumen del Periodo</h4>

        <div style="background-color: var(--surface-hover-color); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <h5>Meta Total de la Semana</h5>
            <p><strong>Terminaciones:</strong> ${metaTotal.toLocaleString('es-MX')}</p>
        </div>

        <div style="background-color: var(--surface-hover-color); padding: 12px; border-radius: 8px;">
            <h5>Línea 1</h5>
            <p><strong>Terminaciones:</strong> ${totales['Línea 1'].term.toLocaleString('es-MX')}</p>
            <p><strong>Eficiencia:</strong> ${eficienciaL1.toFixed(1)}%</p>
        </div>

        <div style="background-color: var(--surface-hover-color); padding: 12px; border-radius: 8px; margin-top: 16px;">
            <h5>Línea 2</h5>
            <p><strong>Terminaciones:</strong> ${totales['Línea 2'].term.toLocaleString('es-MX')}</p>
            <p><strong>Eficiencia:</strong> ${eficienciaL2.toFixed(1)}%</p>
        </div>

        <div class="summary-bars-wrapper">
            <div class="summary-bar-container">
                <div class="summary-bar" style="height: ${alturaBarraL1}%; background-color: rgba(245, 158, 11, 0.8);">
                    <span>${eficienciaL1.toFixed(0)}%</span>
                </div>
                <div class="summary-bar-label">Línea 1</div>
            </div>

            <div class="summary-bar-container">
                <div class="summary-bar" style="height: ${alturaBarraL2}%; background-color: rgba(16, 185, 129, 0.8);">
                    <span>${eficienciaL2.toFixed(0)}%</span>
                </div>
                <div class="summary-bar-label">Línea 2</div>
            </div>
        </div>
    `;
}

        function renderProductionTable(data, tableId, lineName) {
            const table = doc(tableId);
            if (!data || data.length === 0) {
                table.innerHTML = `<thead><tr><th>Sin registros para ${lineName}.</th></tr></thead><tbody></tbody>`;
                return;
            }
            const headers = ['Orden', 'Box ID', 'Catálogo', 'Piezas', 'Fecha/Hora', 'Term.'];
            let html = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;
            data.forEach(row => {
                html += `<tr><td>${row.orden}</td><td>${row.boxId}</td><td>${row.catalogo}</td><td>${row.piezas}</td><td>${formatShortDateTime(row.timestamp)}</td><td>${row.terminaciones}</td></tr>`;
            });
            table.innerHTML = html + `</tbody>`;
        }

        // --- FUNCIÓN DE REEMPLAZO (renderProductionChart) ---
function renderProductionChart(data, shiftStartTime, turno) {
    // --- INICIO DEL ARREGLO ---
    const canvas = doc('produccionChart'); // 1. Obtenemos el <canvas>
    if (!canvas) { // 2. Seguridad por si no lo encuentra
        console.error("renderProductionChart: No se encontró el canvas 'produccionChart'.");
        return; 
    }
    const ctx = canvas.getContext('2d'); // 3. Obtenemos el contexto

    // 4. ¡EL ARREGLO! Primero destruimos el chart viejo, si existe
    if (productionChart) {
        productionChart.destroy();
    }

    // 5. ¡EL ARREGLO! Limpiamos a la fuerza el canvas (crucial en móviles)
    // Esto ahora se hace SIEMPRE, para asegurar que la memoria se libere
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    // --- FIN DEL ARREGLO ---

    if(data.length === 0){
        // Ya no necesitamos el clearRect aquí, solo el resto
        doc('chartSummary').innerHTML = ''; doc('exportChartBtn').style.display = 'none'; return;
    }

    // --- INICIO DE LA MODIFICACIÓN DINÁMICA ---
    const goals = Array(12).fill(480); // Metas (esto sigue igual)
    goals[1] = 360; goals[5] = 280; goals[8] = 360; 
    const visualGoalLine = Array(12).fill(480);

    const hourlyData = {}; // { 0: {}, 1: {}, ... 11: {} }
    const labels = [];
    const totalSummary = {}; // Objeto vacío
    const lineasEncontradas = new Set(); // Set para líneas únicas

    // 1. Inicializar etiquetas y hourlyData
    for (let i = 0; i < 12; i++) {
        const startHour = new Date(shiftStartTime); startHour.setHours(startHour.getHours() + i);
        const endHour = new Date(startHour); endHour.setHours(endHour.getHours() + 1);
        const format = { hour: '2-digit', minute: '2-digit', hour12: false };
        labels.push(`${startHour.toLocaleTimeString('es-ES', format)} - ${endHour.toLocaleTimeString('es-ES', format)}`);
        hourlyData[i] = {}; // Objeto vacío para cada hora
    }

    // 2. Procesar datos y descubrir líneas
    data.forEach(item => {
        const lineaNombre = item.linea; // ej: "Línea 1", "Línea 3"
        if (!lineaNombre) return; // Ignorar si no tiene línea

        lineasEncontradas.add(lineaNombre); // Añadir al Set

        // Inicializar summary si es la primera vez que vemos esta línea
        if (!totalSummary[lineaNombre]) {
            totalSummary[lineaNombre] = { piezas: 0, terminaciones: 0 };
        }

        const diffHours = Math.floor((item.timestamp - shiftStartTime) / (1000 * 60 * 60));
        if(diffHours >= 0 && diffHours < 12){
            // Inicializar la línea en el bin de esa hora si no existe
            if (!hourlyData[diffHours][lineaNombre]) {
                hourlyData[diffHours][lineaNombre] = 0;
            }
            hourlyData[diffHours][lineaNombre] += item.terminaciones;
        }

        // Acumular totales
        totalSummary[lineaNombre].piezas++;
        totalSummary[lineaNombre].terminaciones += item.terminaciones;
    });

    // 3. Crear el HTML del resumen dinámicamente
    const lineasOrdenadas = [...lineasEncontradas].sort(); // ["Línea 1", "Línea 2", "Línea 3"]
    const summaryHtml = lineasOrdenadas.map(linea => {
        const summary = totalSummary[linea];
        return `${linea}: <strong>${summary.piezas} pzas / ${summary.terminaciones} term.</strong>`;
    }).join(' | ');
    doc('chartSummary').innerHTML = summaryHtml;

    // 4. Crear los datasets dinámicamente
    const colors = ['rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)', 'rgba(75, 192, 192, 0.6)', 'rgba(255, 206, 86, 0.6)', 'rgba(153, 102, 255, 0.6)'];
    const borderColors = ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)', 'rgba(255, 206, 86, 1)', 'rgba(153, 102, 255, 1)'];

    const dynamicDatasets = lineasOrdenadas.map((linea, index) => {
        return {
            label: linea,
            data: Object.values(hourlyData).map(d => d[linea] || 0), // Obtener el dato de esa línea, o 0
            backgroundColor: colors[index % colors.length],
            borderColor: borderColors[index % borderColors.length],
            borderWidth: 1,
            order: 1
        };
    });

    // 5. Añadir el dataset de la meta
    dynamicDatasets.unshift({ 
        type: 'line', 
        label: 'Meta', 
        data: visualGoalLine,// Usamos el array de metas que definimos arriba
        borderColor: getComputedStyle(document.body).getPropertyValue('--success-color'), 
        borderWidth: 2, 
        borderDash: [5, 5], 
        pointRadius: 0, 
        fill: false, 
        order: 0 
    });

    // --- FIN DE LA MODIFICACIÓN DINÁMICA ---

    productionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: dynamicDatasets // <-- USAR LOS DATASETS DINÁMICOS
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: 'var(--text-primary)', filter: item => item.datasetIndex > 0 } }, // Sigue ocultando la meta
                title: { display: true, text: `Producción de Terminaciones - ${turno}`, color: 'var(--text-primary)', font: { size: 16 } },
                datalabels: {
                    display: context => context.dataset.type !== 'line',
                    labels: {
                        value: {
                            anchor: 'end', 
                            align: 'top',
                            offset: 5,
                            backgroundColor: (ctx) => {
                                const isSuccess = ctx.dataset.data[ctx.dataIndex] >= goals[ctx.dataIndex]; // Revisa contra la meta correcta
                                const colorVar = isSuccess ? '--glow-green' : '--glow-red';
                                const rawColor = getComputedStyle(document.body).getPropertyValue(colorVar).trim();
                                return rawColor.replace(/0.9\)$/, '0.4)');
                            },
                            borderColor: (ctx) => {
                                return ctx.dataset.data[ctx.dataIndex] >= goals[ctx.dataIndex] ? getComputedStyle(document.body).getPropertyValue('--success-color') : getComputedStyle(document.body).getPropertyValue('--danger-color');
                            },
                            borderWidth: 1,
                            borderRadius: 4,
                            color: 'white',
                            font: { weight: 'bold' },
                            padding: { top: 2, bottom: 2, left: 5, right: 5 },
                            formatter: (value) => value > 0 ? value.toLocaleString() : '',
                        },
                        percentage: { 
                            align: 'center', anchor: 'center',
                            color: (ctx) => {
                                const barHeight = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex].height;
                                return barHeight > 18 ? 'rgba(255, 255, 255, 0.9)' : 'transparent';
                            },
                            font: { weight: 'bold', size: 11 },
                            formatter: (value, ctx) => {
                                const goalForHour = goals[ctx.dataIndex];
                                if (value <= 0 || goalForHour === 0) return '';
                                const percentage = (value / goalForHour) * 100;
                                return percentage.toFixed(0) + '%';
                            },
                            textStrokeColor: 'rgba(0,0,0,0.6)',
                            textStrokeWidth: 2
                        }
                    }
                }
            },
            scales: {
                x: { 
                    grid: { color: 'var(--chart-grid-color)' }, 
                    ticks: { color: 'var(--chart-tick-color)', maxRotation: 0, minRotation: 0, autoSkip: true, font: { size: 10 } },
                    categoryPercentage: 0.7,
                    barPercentage: 0.9
                },
                y: { 
                    beginAtZero: true, 
                    grid: { color: 'var(--chart-grid-color)' }, 
                    ticks: { color: 'var(--chart-tick-color)' }, 
                    title: { display: true, text: 'Total de Terminaciones', color: 'var(--chart-tick-color)' },
                    afterDataLimits: (scale) => {
                        scale.max = scale.max * 1.2;
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
    doc('exportChartBtn').style.display = 'block';
    updateChartTheme();
}

        // --- FUNCIÓN DE REEMPLAZO (renderFiberReport) ---
        function renderFiberReport(data) {
            const container = doc('fibraReportContent');
            
            // --- INICIO DE LA MODIFICACIÓN DINÁMICA ---
            
            // 1. Destruir todos los pie charts anteriores
            if (fiberPieCharts.length > 0) {
                fiberPieCharts.forEach(chart => chart.destroy());
                fiberPieCharts = []; // Limpiar el array
            }

            if (!data || data.length === 0) { 
                container.innerHTML = '<p>No hay datos de producción para analizar.</p>'; 
                return; 
            }

            // 2. Agrupar datos por línea
            const datosPorLinea = new Map();
            const lineasEncontradas = new Set();
            data.forEach(item => {
                const lineaNombre = item.linea;
                if (!lineaNombre) return;

                lineasEncontradas.add(lineaNombre);
                if (!datosPorLinea.has(lineaNombre)) {
                    datosPorLinea.set(lineaNombre, []);
                }
                datosPorLinea.get(lineaNombre).push(item);
            });

            // 3. Helper (generateHtmlForLine) - (La función interna ya era dinámica, no cambia)
            const generateHtmlForLine = (lineData, lineName, chartId) => {
                if (lineData.length === 0) return `<div><h5>${lineName}</h5><p>Sin producción registrada.</p></div>`;
                const fibraData = {};
                lineData.forEach(item => {
                    const fibraKey = `${item.fibras} Fibras`;
                    const catalogo = item.catalogo;
                    if (!fibraData[fibraKey]) fibraData[fibraKey] = {};
                    if (!fibraData[fibraKey][catalogo]) fibraData[fibraKey][catalogo] = 0;
                    fibraData[fibraKey][catalogo]++;
                });
                let tableHTML = `<div class="table-wrapper" style="max-height: 200px;"><table class="sub-table"><thead><tr><th>Fibra</th><th>Catálogo</th><th>Piezas</th></tr></thead><tbody>`;
                Object.entries(fibraData).forEach(([fibra, catalogos]) => {
                    Object.entries(catalogos).forEach(([catalogo, piezas]) => { tableHTML += `<tr><td>${fibra}</td><td>${catalogo}</td><td>${piezas}</td></tr>`; });
                });
                tableHTML += '</tbody></table></div>';
                return `<div><h5>${lineName}</h5><div class="pie-chart-container"><canvas id="${chartId}"></canvas></div>${tableHTML}</div>`;
            };

            // 4. Helper (createPieChart) - (La función interna ya era dinámica, no cambia)
            const createPieChart = (chartId, lineData) => {
                const ctx = doc(chartId)?.getContext('2d');
                if (!ctx || lineData.length === 0) return null;
                const pieData = {};
                lineData.forEach(item => {
                    const fibraKey = `${item.fibras} Fibras`;
                    if (!pieData[fibraKey]) pieData[fibraKey] = 0;
                    pieData[fibraKey]++;
                });
                const pieLabels = Object.keys(pieData);
                const colors = ['#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
                return new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels: pieLabels,
                        datasets: [{ data: Object.values(pieData), backgroundColor: pieLabels.map((_, i) => colors[i % colors.length]) }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            datalabels: {
                                formatter: (value, ctx) => {
                                    const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    return (value * 100 / sum).toFixed(1) + '%';
                                },
                                color: '#fff',
                                textShadowColor: 'rgba(0,0,0,0.7)', textShadowBlur: 5,
                                font: { weight: 'bold' }
                            }
                        }
                    },
                     plugins: [ChartDataLabels]
                });
            };

            // 5. Generar HTML y crear gráficas dinámicamente
            const lineasOrdenadas = [...lineasEncontradas].sort();
            let gridHtml = '';
            lineasOrdenadas.forEach((lineaNombre, index) => {
                const chartId = `fibraPieChart${index}`;
                const dataDeLinea = datosPorLinea.get(lineaNombre) || [];
                gridHtml += generateHtmlForLine(dataDeLinea, lineaNombre, chartId);
            });

            // Ajustar el grid-template-columns basado en cuántas líneas hay
            container.innerHTML = `<div class="fibra-grid" style="grid-template-columns: repeat(${lineasOrdenadas.length}, 1fr);">${gridHtml}</div>`;

            // 6. Crear las gráficas y guardarlas en el array
            lineasOrdenadas.forEach((lineaNombre, index) => {
                const chartId = `fibraPieChart${index}`;
                const dataDeLinea = datosPorLinea.get(lineaNombre) || [];
                const newChart = createPieChart(chartId, dataDeLinea);
                if (newChart) {
                    fiberPieCharts.push(newChart); // Guardar la instancia
                }
            });
            
	        // --- FIN DE LA MODIFICACIÓN DINÁMICA ---
            
            updateChartTheme();
        }

        function updateChartTheme() {
    const charts = [productionChart, weeklyProductionChart, liveProductionChart].filter(Boolean);
    if (charts.length === 0) return;
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();
    const tickColor = getComputedStyle(document.body).getPropertyValue('--chart-tick-color').trim();
    const gridColor = getComputedStyle(document.body).getPropertyValue('--chart-grid-color').trim();
    const successColor = getComputedStyle(document.body).getPropertyValue('--success-color').trim();
    
    charts.forEach(chart => {
        if (chart.options.plugins.legend) chart.options.plugins.legend.labels.color = textColor;
        if (chart.options.plugins.title) chart.options.plugins.title.color = textColor;
        if(chart.config.type.includes('bar') || chart.config.type.includes('line')) {
            if (chart.options.plugins.datalabels) {
                if(chart.options.plugins.datalabels.labels) {
                    if(chart.options.plugins.datalabels.labels.terminaciones) chart.options.plugins.datalabels.labels.terminaciones.color = textColor;
                } else if (chart.options.plugins.datalabels.color !== 'white') {
                    chart.options.plugins.datalabels.color = textColor;
                }
            }
            if (chart.data.datasets.some(ds => ds.type === 'line')) {
                let lineDataset = chart.data.datasets.find(ds => ds.type === 'line');
                if (lineDataset) lineDataset.borderColor = successColor;
            }
            // El bloque que causaba el problema ha sido eliminado de aquí.
            if (chart.options.scales.x) { chart.options.scales.x.ticks.color = tickColor; chart.options.scales.x.grid.color = gridColor; }
            if (chart.options.scales.y) { chart.options.scales.y.ticks.color = tickColor; chart.options.scales.y.grid.color = gridColor; }
            if (chart.options.scales.y.title) chart.options.scales.y.title.color = tickColor;
        }
        chart.update();
    });
}

async function exportarReporteCompleto() {
    const wrapper = document.getElementById('exportWrapper');
    const modalContent = document.getElementById('modalContent'); // Necesitamos el padre para ocultar los tabs
    const btn = document.getElementById('exportarReporteCompletoBtn');
    
    if (!wrapper) return;

    // 1. Preparar UI para la foto
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '📸'; // Indicador visual

    // Añadimos clases para cambiar el layout
    modalContent.classList.add('export-mode-parent'); // Para ocultar tabs
    wrapper.classList.add('export-mode'); // Para reacomodar gráfica y ranking
    
    // IMPORTANTE: Forzar redimensionamiento de la gráfica para que llene el nuevo espacio
    if (graficaSemanalInstance) {
        graficaSemanalInstance.resize();
    }

    // Esperamos un poco para que el navegador procese los cambios de estilo y la gráfica se redibuje
    await new Promise(r => setTimeout(r, 800));

    // Definir color de fondo (para evitar transparencias raras)
    const isDark = document.body.classList.contains('dark-theme');
    const bgColor = isDark ? '#1f2937' : '#ffffff';

    try {
        // 2. Capturar con html2canvas
        // Usamos window.scrollTo para evitar problemas si el usuario bajó en la página
        const scrollY = window.scrollY;
        
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor,
            scale: 2, // Doble resolución para que se vea nítido
            useCORS: true,
            logging: false,
            width: 1200, // Coincide con el CSS
            windowWidth: 1200,
            onclone: (clonedDoc) => {
                // Truco: Asegurar que en el clon todo sea visible
                const clonedWrapper = clonedDoc.getElementById('exportWrapper');
                clonedWrapper.style.display = 'grid';
            }
        });

        // 3. Descargar
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        
        const fInicio = document.getElementById('semanal_fecha_inicio').value;
        const fFin = document.getElementById('semanal_fecha_fin').value;
        link.download = `Reporte_Semanal_Completo_${fInicio}_al_${fFin}.jpg`;
        link.click();

    } catch (e) {
        console.error("Error al exportar reporte completo:", e);
        alert("Hubo un error al generar la imagen. Intenta de nuevo.");
    } finally {
        // 4. Restaurar UI (Super importante)
        wrapper.classList.remove('export-mode');
        modalContent.classList.remove('export-mode-parent');
        
        // Regresar la gráfica a su tamaño normal
        if (graficaSemanalInstance) {
            graficaSemanalInstance.resize();
        }
        
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}


        function exportChartAsJPG() {
            const chartContainer = doc('chartContainer');
            if (!productionChart || !chartContainer) { showModal('Error', '<p>No hay una gráfica para exportar.</p>'); return; }
            const exportBtn = doc('exportChartBtn');
            exportBtn.style.visibility = 'hidden';
            const theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
            const bgColor = theme === 'dark' ? '#2a2d32' : '#f9fafb';
            html2canvas(chartContainer, { backgroundColor: bgColor, scale: 2.5, useCORS: true })
            .then(canvas => {
                const link = document.createElement('a');
                link.href = canvas.toDataURL('image/jpeg', 0.95);
                const fecha = doc('prod_fecha_inicio').value || 'fecha';
                const turno = doc('prod_turno').value;
                link.download = `Reporte_Produccion_${turno}_${fecha}.jpg`;
                link.click();
            }).finally(() => { exportBtn.style.visibility = 'visible'; });
        }
        
        function exportarSemanalComoJPG() {
            const container = doc('semanalContainer');
            if (!weeklyProductionChart || !container) {
                showModal('Error', '<p>No hay una gráfica semanal para exportar. Genere el reporte primero.</p>');
                return;
            }
            
            const exportBtn = doc('exportarSemanalBtn');
            exportBtn.style.visibility = 'hidden';

            const theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
            const bgColor = theme === 'dark' ? '#22252a' : '#f9fafb';

            html2canvas(container, { backgroundColor: bgColor, scale: 2, useCORS: true })
                .then(canvas => {
                    const link = document.createElement('a');
                    link.href = canvas.toDataURL('image/jpeg', 0.95);
                    
                    const fechaInicio = doc('prod_fecha_inicio').value;
                    const fechaFin = doc('prod_fecha_fin').value;
                    
                    link.download = `Reporte_Semanal_Produccion_${fechaInicio}_al_${fechaFin}.jpg`;
                    link.click();
                }).finally(() => {
                    exportBtn.style.visibility = 'visible';
                });
        }
        

        // =======================================================================================
// --- INICIO: LÓGICA REPORTE TERMINACIONES (CEREBRO DINÁMICO + BD + CONSULTA) ---
// =======================================================================================

// --- FUNCIÓN VERIFICADA Y COMPLETA (CEREBRO + VISUALIZACIÓN + PREPARACIÓN GUARDADO) ---

async function processTerminacionesReport() {
    // 1. Validaciones iniciales
    if (!reportData.zpptwc || !reportData.coois) return;

    const config = params.terminaciones_config;
    const joinKey = 'Orden';

    if (!config.zpptwc_cols.some(c => c.key === joinKey) || !config.coois_cols.some(c => c.key === joinKey)) {
        showModal('Error de Configuración', '<p>Asegúrese de mapear una columna con el nombre clave "Orden" en ambos reportes.</p>');
        return;
    }

    // 2. Mapa para cruce rápido de datos
    const cooisMap = new Map(reportData.coois.map(row => [String(row[joinKey] || '').replace(/^0+/, ''), row]));

    // 3. Procesamiento fila por fila
    const finalData = reportData.zpptwc.map(zpptwcRow => {
        const cleanOrder = String(zpptwcRow[joinKey] || '').replace(/^0+/, '');
        const cooisRow = cooisMap.get(cleanOrder) || {};
        
        let merged = { ...zpptwcRow, ...cooisRow };
        let finalRow = {};

        // Limpieza y unificación de datos
        for (const key in merged) {
            let value = merged[key];
            if (typeof value === 'string') value = value.trim();
            
            if (key === 'Orden' || key === 'Material' || key === 'Operacion') {
                finalRow[key] = String(value || '').replace(/^0+/, '');
            } else if (key === 'Fecha' && value instanceof Date) {
                // IMPORTANTE: Mantenemos el objeto Date puro para la Base de Datos
                finalRow[key] = value; 
            } else {
                finalRow[key] = value;
            }
        }

        // Determinar Área según configuración del Tab 3
        const areaCode = finalRow[config.area_config.source_col];
        const areaMapping = config.area_config.mappings.find(m => String(m.code).trim() === String(areaCode).trim());
        finalRow['Area'] = areaMapping ? areaMapping.name : 'Desconocida';

        // Copiar columnas directas
        config.final_cols.filter(c => c.type === 'source').forEach(col => { finalRow[col.key] = finalRow[col.value]; });

        // ============================================================
        // AQUÍ ESTÁ TU CEREBRO DINÁMICO (Tab 5 del Engrane)
        // ============================================================
        const autoFibrasCol = config.final_cols.find(c => c.type === 'fibras_auto');
        
        if (autoFibrasCol) {
            const area = (finalRow['Area'] || '').trim().toUpperCase();
            const catalogo = (finalRow['Catalogo'] || '').trim().toUpperCase();
            let fibras = 0;

            // Buscamos las reglas configuradas para esta área
            const rules = (config.fiber_rules && config.fiber_rules[area]) ? config.fiber_rules[area] : (config.fiber_rules?.['DEFAULT'] || []);
            // Buscamos coincidencia de prefijo
            const matchedRule = rules.find(r => catalogo.startsWith(r.prefix || ''));

            if (matchedRule) {
                // --- TRUCO: Si Longitud es 0, usamos el Multiplicador como VALOR FIJO ---
                // (Esto arregla lo de NON STD y SPECIALTY)
                if (parseInt(matchedRule.length) === 0) {
                    fibras = parseInt(matchedRule.multiplier) || 0;
                } else {
                    // Lógica normal: Extraer dígitos y multiplicar
                    const startIdx = (matchedRule.start || 4) - 1;
                    const checkChar = catalogo.substring(startIdx, startIdx + 1);

                    if (matchedRule.t_equals_12 && checkChar === 'T') {
                        fibras = 12;
                    } else {
                        const extracted = formulaHelpers.EXTRAER_FIBRAS(catalogo, matchedRule.start, matchedRule.length);
                        const mult = matchedRule.multiplier || 1;
                        fibras = extracted * mult;
                    }
                }
            } else {
                // Fallback estándar si no hay reglas (4to dígito)
                const char = catalogo.substring(3, 4);
                if (char === 'T') fibras = 12;
                else if (char === 'G') fibras = 24;
                else {
                    const num = parseInt(char, 10);
                    fibras = isNaN(num) ? 0 : num;
                }
            }
            
            finalRow[autoFibrasCol.key] = fibras;
        }

        // Calcular Familia automáticamente
        const autoFamiliaCol = config.final_cols.find(c => c.type === 'familia_auto');
        if (autoFamiliaCol) { finalRow[autoFamiliaCol.key] = formulaHelpers.EXTRAER(finalRow['Catalogo'], 1, 3); }

        // Calcular Terminaciones Totales
        const autoTermCol = config.final_cols.find(c => c.type === 'terminaciones_auto');
        if (autoTermCol) {
            const fibras = finalRow['Fibras'] || 0;
            const cantidad = parseFloat(finalRow['Cantidad']) || 0;
            finalRow[autoTermCol.key] = fibras * cantidad;
        }

        // Limpieza final de números negativos o inválidos
        if (finalRow['Terminaciones'] !== undefined) {
            let value = parseFloat(finalRow['Terminaciones']);
            finalRow['Terminaciones'] = (isNaN(value) || value < 0) ? 0 : value;
        }

        return finalRow;
    });

    // 4. Renderizado Visual (Tabla y Resumen)
    // Creamos una copia para visualización donde la fecha se convierte a texto bonito
    const dataForTable = finalData.map(row => {
        const r = {...row};
        if (r['Fecha'] instanceof Date) {
            r['Fecha'] = `${String(r['Fecha'].getDate()).padStart(2,'0')}/${String(r['Fecha'].getMonth()+1).padStart(2,'0')}/${r['Fecha'].getFullYear()}`;
        }
        return r;
    });

    renderTerminacionesTable(dataForTable);
    renderTerminacionesSummary(dataForTable);

    // 5. Guardado Automático en Base de Datos
    // Pasamos 'finalData' (con fechas reales) y no 'dataForTable' (con fechas texto)
    saveTerminacionesToFirestore(finalData);
}
// 2. Guardar en Firestore (Nueva Función)
// --- FUNCIÓN DE GUARDADO CORREGIDA (SIN ERROR DE SINTAXIS) ---
async function saveTerminacionesToFirestore(data) {
    if (!data || data.length === 0) return;
    
    showModal('Guardando Histórico...', '<p>Subiendo registros a la base de datos (Corrección de duplicados aplicada)...</p>');
    
    const batchSize = 500;
    let batches = [];
    let currentBatch = db.batch();
    let count = 0;

    // Usamos 'index' para diferenciar filas repetidas de la misma orden
    data.forEach((row, index) => {
        if (row['Orden']) {
            
            let dateStr = 'NODATE';
            if (row['Fecha'] instanceof Date) {
                const year = row['Fecha'].getFullYear();
                const month = String(row['Fecha'].getMonth() + 1).padStart(2, '0');
                const day = String(row['Fecha'].getDate()).padStart(2, '0');
                dateStr = `${year}-${month}-${day}`;
            }

            // --- AQUÍ ESTABA EL ERROR, YA ESTÁ CORREGIDO ---
            // ID Único: Orden_Fecha_Indice (Ej: 1000152_2025-11-24_row0)
            const uniqueId = `${String(row['Orden'])}_${dateStr}_row${index}`;
            
            const docRef = db.collection('terminaciones_historico').doc(uniqueId);
            
            // Asegurar formato correcto para Firestore
            const rowToSave = {...row};
            if (rowToSave['Fecha'] instanceof Date) {
                rowToSave['Fecha'] = firebase.firestore.Timestamp.fromDate(rowToSave['Fecha']);
            }
            
            currentBatch.set(docRef, rowToSave, { merge: true });
            count++;

            if (count >= batchSize) {
                batches.push(currentBatch.commit());
                currentBatch = db.batch();
                count = 0;
            }
        }
    });

    if (count > 0) batches.push(currentBatch.commit());

    try {
        await Promise.all(batches);
        showModal('Éxito', `<p>Se guardaron <strong>${data.length}</strong> registros únicos correctamente.</p>`);
    } catch (e) {
        console.error("Error guardando:", e);
        showModal('Error', '<p>Hubo un problema al guardar en la base de datos.</p>');
    }
}

// 3. Consultar Histórico (Nueva Función)
async function consultarTerminacionesHistorico() {
    const fInicio = doc('term_fecha_inicio').value;
    const fFin = doc('term_fecha_fin').value;
    const btn = doc('consultarTerminacionesHistoricoBtn');

    if (!fInicio || !fFin) {
        alert("Por favor selecciona un rango de fechas.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = 'Buscando...';

    // Convertir fechas string a objetos Date para la consulta
    const startDate = new Date(`${fInicio}T00:00:00`);
    const endDate = new Date(`${fFin}T23:59:59`);

    try {
        const snapshot = await db.collection('terminaciones_historico')
            .where('Fecha', '>=', firebase.firestore.Timestamp.fromDate(startDate))
            .where('Fecha', '<=', firebase.firestore.Timestamp.fromDate(endDate))
            .get();

        if (snapshot.empty) {
            renderTerminacionesTable([]);
            renderTerminacionesSummary([]);
            showModal('Sin Resultados', `<p>No se encontraron registros del ${fInicio} al ${fFin}.</p>`);
        } else {
            const data = [];
            snapshot.forEach(docSnap => {
                const d = docSnap.data();
                // Convertir Timestamp de Firestore a String para la tabla
                if (d['Fecha'] && d['Fecha'].toDate) {
                    const dateObj = d['Fecha'].toDate();
                    d['Fecha'] = `${String(dateObj.getDate()).padStart(2,'0')}/${String(dateObj.getMonth()+1).padStart(2,'0')}/${dateObj.getFullYear()}`;
                }
                data.push(d);
            });
            
            // Renderizar tabla y resumen (esto crea tu tabla pivote automáticamente)
            renderTerminacionesTable(data);
            renderTerminacionesSummary(data);
        }
    } catch (e) {
        console.error("Error consulta:", e);
        showModal('Error', '<p>Error al consultar la base de datos.</p>');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Consultar Rango';
    }
}

// 4. Renderizar Tabla
// --- FUNCIÓN DE RENDERIZADO (CON ORDENAMIENTO Y FILTROS) ---
function renderTerminacionesTable(data) {
    const tableElement = doc('dataTableTerminaciones');
    const config = params.terminaciones_config.final_cols;
    
    if (!config || config.length === 0) {
        tableElement.innerHTML = '<thead><tr><th>Configure columnas</th></tr></thead><tbody></tbody>'; 
        return; 
    }
    
    // 1. ORDENAR DATOS (FECHA DESCENDENTE: MÁS RECIENTE ARRIBA)
    data.sort((a, b) => {
        const dateA = parseDate(a['Fecha']);
        const dateB = parseDate(b['Fecha']);
        return dateB - dateA; // b - a = Descendente
    });

    // Helper interno para leer la fecha (ya sea Texto o Date Object)
    function parseDate(dateVal) {
        if (dateVal instanceof Date) return dateVal;
        if (typeof dateVal === 'string') {
            // Asume formato DD/MM/YYYY
            const parts = dateVal.split('/');
            if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(0); // Fecha muy vieja si falla
    }

    const allHeaders = config.map(c => c.key);
    
    // 2. CREAR HEADER CON INPUTS DE FILTRO
    let html = '<thead><tr>';
    allHeaders.forEach(header => { 
        html += `
            <th>
                <span>${header}</span>
                <input type="text" class="filter-input" placeholder="Buscar..." data-column="${header}" style="width:100%; margin-top:5px; padding:4px; box-sizing:border-box; font-size:0.8em; color:black;">
            </th>`; 
    });
    html += '</tr></thead><tbody>';

    // 3. DIBUJAR FILAS
    data.forEach(row => {
        html += '<tr>';
        allHeaders.forEach(header => { 
            const value = row[header] ?? '';
            // Habilitar copiado para GR u Orden
            if (header.toUpperCase().includes('GR') || header.toUpperCase().includes('ORDEN')) {
                 html += `<td class="copyable" onclick="copyToClipboard('${String(value).replace(/'/g, "\\'")}', this)" title="Haz clic para copiar">${value}</td>`;
            } else {
                html += `<td>${value}</td>`;
            }
        });
        html += '</tr>';
    });
    
    tableElement.innerHTML = html + '</tbody>';

    // 4. ACTIVAR LOS LISTENERS DE LOS FILTROS
    tableElement.querySelectorAll('.filter-input').forEach(input => {
        input.addEventListener('keyup', filterTerminacionesTable);
    });
}

// 5. Filtro de Tabla
// --- FUNCIÓN DE FILTRADO (MULTI-COLUMNA) ---
function filterTerminacionesTable() {
    const table = doc('dataTableTerminaciones');
    
    // Obtenemos todos los filtros activos (donde el usuario escribió algo)
    const inputs = Array.from(table.querySelectorAll('.filter-input'));
    const activeFilters = inputs
        .map((input, index) => ({
            index: index, // El índice de la columna (0, 1, 2...)
            value: input.value.toLowerCase().trim() // Lo que escribió el usuario
        }))
        .filter(f => f.value !== ""); // Solo nos importan los que tienen texto

    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
        let shouldShow = true;

        // Revisamos si la fila cumple con TODOS los filtros activos
        for (const filter of activeFilters) {
            const cell = row.children[filter.index];
            if (!cell) continue;
            
            const cellText = cell.textContent.toLowerCase();
            // Si el texto de la celda NO incluye lo que escribió el usuario...
            if (!cellText.includes(filter.value)) {
                shouldShow = false;
                break; // Ya falló uno, no tiene caso seguir revisando
            }
        }

        row.style.display = shouldShow ? '' : 'none';
    });
}

// 6. Renderizar Resumen (Tabla Pivote como la foto)
function renderTerminacionesSummary(data) {
    const container = doc('summaryContainer');
    if (!data || data.length === 0) {
        container.innerHTML = `<div class="summary-header"><h3>Resumen de Terminaciones</h3></div><p>No hay datos para mostrar.</p>`;
        return;
    }
    const pivot = {};
    const dates = new Set();
    
    data.forEach(row => {
        const area = row['Area'] || 'Sin Área';
        const fecha = row['Fecha'] || 'Sin Fecha';
        const terminaciones = row['Terminaciones'] || 0;
        if (typeof terminaciones === 'number' && terminaciones > 0) {
            dates.add(fecha);
            if (!pivot[area]) pivot[area] = {};
            if (!pivot[area][fecha]) pivot[area][fecha] = 0;
            pivot[area][fecha] += terminaciones;
        }
    });

    const sortedDates = [...dates].sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
    
    let summaryHTML = `<div class="summary-header"><h3>Resumen de Terminaciones</h3><button id="exportSummaryBtn" class="icon-btn" title="Exportar como JPG"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></div><div id="summaryTableWrapper" class="table-wrapper"><table><thead><tr><th>Área</th>`;
    sortedDates.forEach(date => { summaryHTML += `<th>${date}</th>`; });
    summaryHTML += `<th>Total General</th></tr></thead><tbody>`;

    let colTotals = {};
    sortedDates.forEach(date => colTotals[date] = 0);
    let grandTotal = 0;
    const sortedAreas = Object.keys(pivot).sort();

    for (const area of sortedAreas) {
        let rowTotal = 0;
        summaryHTML += `<tr><td>${area}</td>`;
        sortedDates.forEach(date => {
            const value = pivot[area][date] || 0;
            summaryHTML += `<td>${value.toLocaleString()}</td>`;
            rowTotal += value;
            colTotals[date] += value;
        });
        summaryHTML += `<td class="grand-total">${rowTotal.toLocaleString()}</td></tr>`;
        grandTotal += rowTotal;
    }

    summaryHTML += `<tr class="grand-total"><td>Total General</td>`;
    sortedDates.forEach(date => { summaryHTML += `<td>${colTotals[date].toLocaleString()}</td>`; });
    summaryHTML += `<td>${grandTotal.toLocaleString()}</td></tr></tbody></table></div>`;

    container.innerHTML = summaryHTML;
    const exportBtn = doc('exportSummaryBtn');
    if(exportBtn) exportBtn.addEventListener('click', exportSummaryAsJPG);
}

// 7. Función Global de Copiado
window.copyToClipboard = (text, element) => {
    if (!text) return;
    const originalText = element.textContent;
    const originalColor = element.style.color;
    
    navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback(element, originalText, originalColor);
    }).catch(err => {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showCopyFeedback(element, originalText, originalColor);
        } catch (e) { console.error(e); }
    });
};

function showCopyFeedback(element, originalText, originalColor) {
    element.textContent = '¡Copiado!';
    element.style.color = 'var(--success-color)';
    setTimeout(() => {
        element.textContent = originalText;
        element.style.color = originalColor;
    }, 1500);
}

// 8. Exportar Imagen
function exportSummaryAsJPG() {
    const summaryCard = doc('summaryContainer');
    const exportBtn = doc('exportSummaryBtn');
    if (!summaryCard || typeof html2canvas === 'undefined') return;

    exportBtn.disabled = true;
    exportBtn.style.visibility = 'hidden';
    const theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const bgColor = theme === 'dark' ? '#22252a' : '#f9fafb';

    html2canvas(summaryCard, { backgroundColor: bgColor, scale: 2, useCORS: true, onclone: (clonedDoc) => {
        const clonedCard = clonedDoc.getElementById('summaryContainer');
        const clonedWrapper = clonedCard.querySelector('.table-wrapper');
        clonedCard.style.padding = '16px';
        if (clonedWrapper) { clonedWrapper.style.overflow = 'visible'; clonedWrapper.style.width = 'auto'; }
    }}).then(canvas => {
        const link = document.createElement('a');
        link.download = 'Resumen_Terminaciones.jpg';
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.click();
    }).finally(() => {
        exportBtn.style.visibility = 'visible';
        exportBtn.disabled = false;
    });
}

// =======================================================================================
// --- FIN: LÓGICA REPORTE TERMINACIONES ---
// =======================================================================================
        // --- INICIO: LÓGICA REPORTE 901 ---
        async function handle901File(file) {
            const config = params['901_config'];
            if (!config.columns || config.columns.length === 0) { showModal('Error de Configuración', `<p>Por favor, configure el mapeo de columnas para el reporte 901.</p>`); return; }
            const dateColumnMap = config.columns.find(p => p.key.toLowerCase() === 'fecha');
            const userColumnMap = config.columns.find(p => p.key.toLowerCase() === 'usuario');
            if (!dateColumnMap) { showModal('Error de Configuración', `<p>Debe existir una columna llamada "Fecha" en el mapeo.</p>`); return; }
            if (config.userFilter && config.userFilter.length > 0 && !userColumnMap) { showModal('Error de Configuración', `<p>Se especificaron filtros de usuario, pero no hay una columna mapeada como "Usuario".</p>`); return; }
            const allowedUsers = (config.userFilter || []).map(u => u.toUpperCase());
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
                    const ws = wb.Sheets[wb.SheetNames[0]]; const range = XLSX.utils.decode_range(ws['!ref']);
                    const extractedData = []; const today = new Date(); today.setHours(0, 0, 0, 0);
                    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                        const dateCol = dateColumnMap.startCell.match(/[A-Z]+/)[0];
                        const dateCell = ws[dateCol + (R + 1)];
                        if (!dateCell || !dateCell.v) continue;
                        let rowDate = dateCell.t === 'n' ? excelSerialToDateObject(dateCell.v) : dateCell.v instanceof Date ? dateCell.v : null;
                        if (!rowDate) continue; rowDate.setHours(0,0,0,0);
                        const isToday = rowDate.getTime() === today.getTime(); const isPast = rowDate.getTime() < today.getTime();
                        let userValue = '';
                        if (userColumnMap) {
                            const userCol = userColumnMap.startCell.match(/[A-Z]+/)[0]; const userCell = ws[userCol + (R + 1)];
                            userValue = (userCell ? String(userCell.v) : '').toUpperCase();
                        }
                        const userIsOnFilterList = allowedUsers.length === 0 || allowedUsers.includes(userValue);
                        if (isPast || (isToday && userIsOnFilterList)) {
                            let rowData = {};
                            config.columns.forEach(p => {
                                const cellConfig = p.startCell.trim().toUpperCase(); let value;
                                if (cellConfig.includes(',')) {
                                    const cols = cellConfig.split(',').map(c => c.trim().match(/[A-Z]+/)[0]); const values = [];
                                    cols.forEach(col => {
                                        const cell = ws[col + (R + 1)]; const cellValue = cell ? (cell.w || cell.v) : undefined;
                                        if (cellValue !== undefined && cellValue !== null && cellValue !== 0 && String(cellValue).trim() !== '') values.push(cellValue);
                                    }); value = values.join(' / ');
                                } else {
                                    const col = cellConfig.match(/[A-Z]+/)[0]; const cell = ws[col + (R + 1)];
                                    value = cell ? (cell.w || cell.v) : undefined;
                                }

                                if (p.key.toLowerCase() === 'qty' && value !== undefined && value !== null) {
                                    const num = parseInt(value, 10);
                                    if (!isNaN(num)) {
                                        value = num;
                                    }
                                }

                                if (p.key.toLowerCase().includes('special stock')) {
                                    if (value === 0 || value === '0') {
                                        value = '';
                                    }
                                }
                                rowData[p.key] = value;
                            });
                            if (userIsOnFilterList) {
                                if (isToday) rowData.colorClass = 'row-today';
                                else if (rowDate.getTime() === yesterday.getTime()) rowData.colorClass = 'row-yesterday';
                                else rowData.colorClass = 'row-past';
                            }
                            extractedData.push(rowData);
                        }
                    }
                    if(extractedData.length === 0){ showModal('Sin Coincidencias', '<p>No se encontraron registros que cumplan con los filtros.</p>'); renderTable901([]); return; }
                    renderTable901(extractedData);
                    showModal('Éxito', `<p>${extractedData.length} registros han sido cargados.</p>`);
                } catch (err) { console.error("Error al procesar archivo 901:", err); showModal('Error de Archivo', `<p>No se pudo procesar el archivo. Verifique el formato y la configuración.</p>`) }
            };
            reader.readAsArrayBuffer(file);
        }

        function renderTable901(data) {
            const tableElement = doc('dataTable901'); const paramConfig = params['901_config'].columns;
            if (!paramConfig || !paramConfig.length) { tableElement.innerHTML = `<thead><tr><th>Por favor, configure el mapeo de columnas.</th></tr></thead><tbody></tbody>`; return; }
            const headers = paramConfig.map(p => p.key); let html = '<thead><tr>';
            headers.forEach(h => html += `<th><span>${h}</span><input type="text" class="filter-input" placeholder="Filtrar..." data-column="${h}"></th>`);
            html += '</tr></thead><tbody>';
            data.forEach(row => {
                html += `<tr class="${row.colorClass || ''}">`;
                headers.forEach(header => {
                    const value = row[header] ?? '';
                    if (header.toUpperCase() === 'GR') html += `<td class="copyable" onclick="copyToClipboard('${String(value).replace(/'/g, "\\'")}', this)" title="Haz clic para copiar">${value}</td>`;
                    else html += `<td>${value}</td>`;
                });
                html += '</tr>';
            });
            tableElement.innerHTML = html + '</tbody>';
            tableElement.querySelectorAll('.filter-input').forEach(input => { input.addEventListener('keyup', () => filterTable901()); });
        }

        function filterTable901() {
            const table = doc('dataTable901');
            const filters = Array.from(table.querySelectorAll('.filter-input')).map(i => ({ columnIndex: Array.from(i.closest('tr').children).indexOf(i.closest('th')), value: i.value.toLowerCase() }));
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                let shouldShow = true;
                filters.forEach(filter => { if (filter.value) { const cell = row.children[filter.columnIndex]; if (!cell || !cell.textContent.toLowerCase().includes(filter.value)) shouldShow = false; } });
                row.style.display = shouldShow ? '' : 'none';
            });
        }

// =================================================================
// --- CORRECCIÓN FINAL TARIMAS: VARIABLES + FUNCIONES DE SOPORTE ---
// =================================================================

// 1. VARIABLE GLOBAL (Para guardar los usuarios y no leerlos a cada rato)
let globalUsersCache = null; 

// 2. FUNCIÓN DE SOPORTE (Descarga catálogo de usuarios)
async function ensureUsersCache() {
    if (globalUsersCache) return globalUsersCache;
    
    console.log("📥 Descargando catálogo de usuarios y áreas...");
    try {
        const snapshot = await db.collection('users_tarimas').get();
        const usersMap = new Map();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // Guardamos: Clave = Gafete (ej: LUNAU2), Valor = Área (ej: MULTIPORT)
            if (data.gafete && data.area) {
                usersMap.set(data.gafete.toUpperCase(), data.area);
            }
        });
        
        globalUsersCache = usersMap;
        return usersMap;
    } catch (e) {
        console.error("Error cargando usuarios:", e);
        return new Map();
    }
}

// 3. FUNCIÓN PRINCIPAL CORREGIDA (Lotes de 10 + Cruce de Usuarios)
async function consultarTarimas() {
    const fechaInput = doc('prodTarimas_fecha').value;
    const turnoSeleccionado = doc('prodTarimas_turno').value;
    const areaSeleccionada = doc('prodTarimas_area').value;

    if (!fechaInput || !turnoSeleccionado || !areaSeleccionada) {
        showModal('Datos Requeridos', '<p>Por favor, seleccione fecha, turno y área.</p>');
        return;
    }

    const btn = doc('consultarTarimasBtn');
    if (btn) { btn.disabled = true; btn.textContent = `Consultando...`; }

    const tableContainer = doc('tarimasTableContainer');
    const tableElement = doc('dataTableTarimas');
    
    if(doc('terminacionesDashboardContainer')) doc('terminacionesDashboardContainer').style.display = 'none';
    
    tableContainer.style.display = 'flex';
    tableElement.innerHTML = '<thead><tr><th>Analizando tarimas y cajas...</th></tr></thead><tbody></tbody>';

    try {
        // A. CARGAR MAPA DE USUARIOS (Indispensable para arreglar "Indefinida")
        const usersMap = await ensureUsersCache();

        // B. OBTENER LAS TARIMAS
        // Quitamos filtro de área en BD porque las tarimas viejas no lo tienen
        let query = db.collection('tarimas_confirmadas');
        
        const { startTime, endTime } = getShiftDateRange(fechaInput, turnoSeleccionado);
        query = query.where('fecha', '>=', startTime).where('fecha', '<=', endTime);

        const palletsSnapshot = await query.get();

        if (palletsSnapshot.empty) {
            throw new Error(`No se encontraron tarimas para ${turnoSeleccionado} en este rango de fecha.`);
        }

        // C. FILTRAR Y ENRIQUECER DATOS
        let tarimasDelTurno = [];
        let allBoxIdsToVerify = new Set();
        const parts = fechaInput.split('-');
        const fechaComparar = `${parts[0]}-${parts[1]}-${parts[2]}`;

        palletsSnapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (!data.fecha || !data.cajas) return;

            try {
                const dateObj = data.fecha.toDate();
                const { shift, dateKey } = getWorkShiftAndDate(dateObj);

                if (dateKey === fechaComparar && shift === turnoSeleccionado) {
                    // --- AQUÍ ARREGLAMOS EL ÁREA USANDO EL MAPA DE USUARIOS ---
                    const usuario = (data.gafete || '').toUpperCase();
                    // Si la tarima trae área, úsala. Si no, búscala en el mapa por usuario.
                    let areaReal = data.area || usersMap.get(usuario) || 'Indefinida';

                    // FILTRO DE ÁREA EN MEMORIA
                    if (areaSeleccionada === 'ALL' || areaReal === areaSeleccionada) {
                        
                        tarimasDelTurno.push({ id: docSnap.id, ...data, areaCalculada: areaReal });
                        
                        // Recolectar cajas
                        if (Array.isArray(data.cajas)) {
                            data.cajas.forEach(c => {
                                if (c.codigoCaja) allBoxIdsToVerify.add(String(c.codigoCaja).trim());
                            });
                        }
                    }
                }
            } catch (e) { console.error("Error procesando tarima:", e); }
        });

        if (tarimasDelTurno.length === 0) {
            throw new Error(`Se encontraron datos, pero ninguno coincide con el Área ${areaSeleccionada} o el turno exacto.`);
        }

        // D. CONSULTA MASIVA DE CAJAS (LÍMITE 10 PARA QUE NO TRUENE)
        const foundBoxesMap = new Map();
        const boxIdsArray = Array.from(allBoxIdsToVerify);
        
        const fetchBatches = async () => {
            const promises = [];
            while (boxIdsArray.length) {
                // LÍMITE DE 10 (Regla de oro de Firebase Web)
                const batch = boxIdsArray.splice(0, 10); 
                if (batch.length === 0) break;

                const p = db.collection('boxID_historico')
                    .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
                    .get()
                    .then(snap => {
                        snap.forEach(docBox => {
                            foundBoxesMap.set(docBox.id, docBox.data());
                        });
                    });
                promises.push(p);
            }
            await Promise.all(promises);
        };

        console.log(`[Tarimas] Verificando ${allBoxIdsToVerify.size} cajas en lotes de 10...`);
        await fetchBatches();

        // E. ARMAR REPORTE FINAL
        const processedPallets = tarimasDelTurno.map(tarima => {
            const bxidList = tarima.cajas
                .map(box => box?.codigoCaja ? String(box.codigoCaja).trim() : null)
                .filter(bxid => bxid);

            let receivedCount = 0;
            let latestReceivedAt = null;

            const finalBxidDetails = tarima.cajas.map(boxInfo => {
                const bxid = boxInfo.codigoCaja ? String(boxInfo.codigoCaja).trim() : null;
                const orden = boxInfo.numeroOrden || 'N/A';
                if (!bxid) return { bxid: 'N/A', orden, gr: 'N/A', receivedAt: null };

                const historicData = foundBoxesMap.get(bxid);
                if (historicData) {
                    receivedCount++;
                    const recvDate = historicData.receivedAt ? historicData.receivedAt.toDate() : null;
                    if (recvDate && (!latestReceivedAt || recvDate > latestReceivedAt)) latestReceivedAt = recvDate;
                    return { bxid, orden, gr: historicData.gr || 'N/A', receivedAt: recvDate, found: true };
                } else {
                    return { bxid, orden, gr: 'N/A', receivedAt: null, found: false };
                }
            });

            let status = 'status-rojo';
            let statusText = 'No Recibida';
            const totalCajas = bxidList.length;

            if (totalCajas > 0) {
                if (receivedCount === totalCajas) { status = 'status-verde'; statusText = 'Recibida Completa'; }
                else if (receivedCount > 0) { status = 'status-naranja'; statusText = 'Recibida Parcial'; }
            } else if (tarima.cajas.length > 0) { statusText = 'Sin BXIDs'; }

            return {
                folio: tarima.folio, 
                user: tarima.gafete, 
                area: tarima.areaCalculada, // Usamos el área cruzada con Users
                totalCajas: tarima.cajas.length, 
                statusClass: status, 
                statusText: statusText,
                confirmationDate: tarima.fecha.toDate(), 
                latestReceivedAt: latestReceivedAt,
                bxidDetails: finalBxidDetails
            };
        });

        renderTarimasTable(processedPallets);

    } catch (e) {
        console.error("[Tarimas] Error:", e);
        if (e.code === 'failed-precondition') {
            tableElement.innerHTML = `<thead><tr><th style='color:var(--warning-color);'>⚠️ Falta Índice en Firebase</th></tr></thead><tbody><tr><td>Abre la consola (F12) y haz clic en el link para crear índice de Fecha.</td></tr></tbody>`;
        } else {
            tableElement.innerHTML = `<thead><tr><th style='color:var(--danger-color);'>Error: ${e.message}</th></tr></thead>`;
        }
    } finally {
        if(btn) { btn.disabled = false; btn.textContent = 'Consultar Tarimas'; }
    }
}
// --- FIN DE LA FUNCIÓN ---
		
// --- Asegúrate que esta función esté FUERA del DOMContentLoaded ---
function renderTarimasTable(pallets) {
    const table = doc('dataTableTarimas');
    if (!table) {
        console.error("[Render Tarimas] Error: Elemento #dataTableTarimas no encontrado.");
        return;
    }

    if (!pallets || pallets.length === 0) {
        table.innerHTML = `<thead><tr><th>No se encontraron tarimas para esta fecha y turno.</th></tr></thead><tbody></tbody>`;
        return;
    }

    // --- AJUSTE: AÑADIMOS 'ÁREA' AL HEADER ---
    const headers = ['Folio', 'Usuario', 'Área', 'Hora Confirmación', 'Recibido Logística (Último)', 'Estatus', 'Cajas', 'Detalles'];
    let headerHtml = '<thead><tr>';
    headers.forEach((h, index) => {
        let styles = 'padding: 12px 10px; text-align: left; white-space: nowrap;';
        // --- AJUSTE: Añadimos 'Área' al centrado ---
        if (['Área', 'Hora Confirmación', 'Recibido Logística (Último)', 'Estatus', 'Cajas', 'Detalles'].includes(h)) {
            styles += ' text-align: center;';
        }
        headerHtml += `<th style="${styles}"><span>${h}</span></th>`;
    });
    headerHtml += '</tr></thead>';

    let bodyHtml = '<tbody>';
    pallets.sort((a, b) => (a.folio || '').localeCompare(b.folio || ''));

    pallets.forEach((pallet, index) => {
        const confirmationTime = pallet.confirmationDate
            ? pallet.confirmationDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false })
            : 'N/A';
        const latestReceivedFormatted = pallet.latestReceivedAt
            ? formatShortDateTime(pallet.latestReceivedAt)
            : 'Pendiente';

        const detailsButtonHtml = `<button class="btn btn-glass btn-small view-details-btn"
                                           data-index="${index}"
                                           aria-label="Ver detalles de tarima ${pallet.folio}">
                                       Ver <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                   </button>`;

        bodyHtml += `<tr style="border-bottom: 1px solid var(--border-color);">`;
        bodyHtml += `<td style="padding: 10px 10px; font-weight: bold;">${pallet.folio}</td>`;
        bodyHtml += `<td style="padding: 10px 10px;">${pallet.user}</td>`;
        bodyHtml += `<td style="padding: 10px 10px; text-align: center;">${pallet.area}</td>`; // <-- ¡NUEVA CELDA!
        bodyHtml += `<td style="padding: 10px 10px; text-align: center;">${confirmationTime}</td>`;
        bodyHtml += `<td style="padding: 10px 10px; text-align: center;">${latestReceivedFormatted}</td>`;
        bodyHtml += `<td style="padding: 10px 10px; text-align: center;"><span class="status-dot ${pallet.statusClass}"></span> ${pallet.statusText}</td>`;
        bodyHtml += `<td style="padding: 10px 10px; text-align: center; font-weight: bold;">${pallet.totalCajas}</td>`;
        bodyHtml += `<td style="padding: 10px 10px; text-align: center;">${detailsButtonHtml}</td>`;
        bodyHtml += `</tr>`;
    });

    bodyHtml += '</tbody>';
    table.innerHTML = headerHtml + bodyHtml;

    table.querySelectorAll('.view-details-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const index = parseInt(event.currentTarget.dataset.index, 10);
            if (pallets && pallets[index]) {
                const palletData = pallets[index];
                try {
                    const detailsCopy = JSON.parse(JSON.stringify(palletData.bxidDetails));
                    showBoxDetailsModal(detailsCopy, palletData.statusText, palletData.folio);
                } catch (e) {
                     console.error("Error al preparar datos para el modal:", e);
                     showModal('Error', '<p>No se pudieron cargar los detalles (error de datos).</p>');
                }
            } else {
                console.error("[Render Tarimas] Datos de 'pallets' no disponibles para el índice:", index);
                showModal('Error', '<p>No se pudieron cargar los detalles (datos no encontrados).</p>');
            }
        });
    });
}
// --- NUEVA FUNCIÓN PARA MOSTRAR EL MODAL ---
function showBoxDetailsModal(bxidDetails, statusText, folio) {
    console.log("[Modal Detalle] Abriendo para Folio:", folio, " Estado:", statusText, " Datos:", bxidDetails);

    // --- VERIFICACIÓN INICIAL ---
    if (!Array.isArray(bxidDetails)) {
        console.error("[Modal Detalle] Error: bxidDetails no es un array.");
        showModal('Error Interno', '<p>Los datos de las cajas son inválidos.</p>');
        return;
    }
    // --- FIN VERIFICACIÓN ---

    try {
        const detailsWithDates = bxidDetails.map(bx => {
            // --- VERIFICACIÓN EXTRA POR CADA CAJA ---
            if (!bx) {
                console.warn("[Modal Detalle] Se encontró un elemento 'undefined' en bxidDetails.");
                return { // Devolver un objeto por defecto para evitar errores posteriores
                    bxid: 'Inválido',
                    orden: 'N/A',
                    gr: 'N/A',
                    receivedAt: null
                };
            }
            // --- FIN VERIFICACIÓN EXTRA ---

            let receivedDate = null;
            if (bx.receivedAt) { // Solo procesar si receivedAt existe en el objeto bx
                if (typeof bx.receivedAt.toDate === 'function') {
                    receivedDate = bx.receivedAt.toDate();
                } else if (typeof bx.receivedAt === 'string') {
                    const parsedDate = new Date(bx.receivedAt);
                    if (!isNaN(parsedDate)) {
                        receivedDate = parsedDate;
                    } else {
                        console.warn(`[Modal Detalle] No se pudo convertir string a fecha: ${bx.receivedAt}`);
                    }
                } else if (Object.prototype.toString.call(bx.receivedAt) === '[object Date]' && !isNaN(bx.receivedAt)) {
                    receivedDate = bx.receivedAt;
                } else {
                     console.warn(`[Modal Detalle] Formato de fecha no reconocido para BXID ${bx.bxid}:`, bx.receivedAt);
                }
            }
            // Asegurarse de devolver todas las propiedades esperadas, incluso si faltaban en el original
            return {
                bxid: bx.bxid || 'N/A',
                orden: bx.orden || 'N/A',
                gr: bx.gr || 'N/A',
                receivedAt: receivedDate // Será Date o null
            };
        });

        // ... (resto del código para generar modalContentHtml y llamar a showModal - SIN CAMBIOS) ...
        let modalContentHtml = `<p style="text-align:center; font-size:0.9em; color: var(--text-secondary);">Mostrando ${detailsWithDates.length} cajas para Tarima: <strong>${folio}</strong></p>`;
        modalContentHtml += `<ul style="list-style-type: none; padding: 0; max-height: 60vh; overflow-y: auto;">`;

        detailsWithDates.forEach(bx => {
            const isValidDate = bx.receivedAt instanceof Date && !isNaN(bx.receivedAt);
            const isMissing = statusText === 'Recibida Parcial' && !isValidDate;
            const itemClass = isMissing ? 'missing-bxid' : '';
            const receivedFormatted = isValidDate ? formatShortDateTime(bx.receivedAt) : 'Pendiente';
            const statusClassDot = isValidDate ? 'status-verde' : 'status-rojo';

            modalContentHtml += `<li class="${itemClass}" style="margin-bottom: 8px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background-color: var(--surface-color); display: flex; align-items: center; gap: 8px;">
                                  <span class="status-dot ${statusClassDot}" style="flex-shrink: 0;"></span>
                                  <div style="flex-grow: 1; font-size: 0.9em;">
                                    <strong style="color: var(--text-primary);">BXID:</strong> ${bx.bxid}<br>
                                    <strong>Orden:</strong> ${bx.orden} |
                                    <strong>GR:</strong> ${bx.gr} |
                                    <strong>Recibido:</strong> ${receivedFormatted}
                                  </div>
                               </li>`;
        });

        modalContentHtml += `</ul>`;
        showModal(`Detalle de Cajas - Tarima ${folio}`, modalContentHtml);

     } catch (error) {
         console.error("[Modal Detalle] Error construyendo modal:", error);
         showModal('Error', '<p>No se pudieron mostrar los detalles de las cajas. Revisa la consola.</p>');
     }
}
	   

// --- CORRECCIÓN FINAL: CALCULAR TERMINACIONES (CON CRUCE DE USUARIOS) ---
async function consultarTerminacionesConfirmadas() {
    const fechaInput = doc('prodTarimas_fecha').value;
    const turnoSeleccionado = doc('prodTarimas_turno').value;
    const areaSeleccionada = doc('prodTarimas_area').value;

    if (!fechaInput || !turnoSeleccionado || !areaSeleccionada) {
        showModal('Datos Requeridos', '<p>Por favor, seleccione fecha, turno y área.</p>');
        return;
    }

    const btn = doc('calcularTerminacionesDiaBtn');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = `Calculando...`;
    
    // Limpiamos caché de órdenes para asegurar datos frescos si se vuelve a consultar
    orderDataCache.clear(); 

    const parts = fechaInput.split('-');
    const fechaSeleccionadaStr_render = `${parts[2]}/${parts[1]}/${parts[0]}`;
    const fechaSeleccionadaStr_compare = `${parts[0]}-${parts[1]}-${parts[2]}`;
    
    const dashboardContainer = doc('terminacionesDashboardContainer');
    const tableContainer = doc('tarimasTableContainer'); 

    if (tableContainer) tableContainer.style.display = 'none'; 
    if (!dashboardContainer) {
        console.error("[TermConf] Elemento dashboard no encontrado.");
        btn.disabled = false; btn.textContent = 'Calcular Terminaciones del Turno';
        return;
    }
    dashboardContainer.innerHTML = '<p style="text-align:center;">Analizando tarimas y consultando órdenes...</p>'; 
    dashboardContainer.style.display = 'block';

    let granTotalTerminaciones = 0; 
    let totalTarimasProcesadas = 0;
    let totalCajasConsultadas = 0;
    let ordenesConsultadas = new Set();
    let ordenesConDatos = new Set();
    let cajasProcesadasConTerminaciones = 0;
    const summaryByOrderCatalog = {};

    try {
        // 1. CARGAR MAPA DE USUARIOS (EL FIX MAESTRO)
        // Esto nos permite saber el área aunque la tarima no la tenga guardada
        const usersMap = await ensureUsersCache();

        // 2. CONSULTA SIN FILTRO DE ÁREA (Para no perder datos viejos)
        let query = db.collection('tarimas_confirmadas');
        
        // Filtramos solo por fecha/hora (esto sí lo tienen todas)
        const { startTime, endTime } = getShiftDateRange(fechaInput, turnoSeleccionado);
        query = query.where('fecha', '>=', startTime).where('fecha', '<=', endTime);

        const palletsSnapshot = await query.get();

        if (palletsSnapshot.empty) {
            throw new Error(`No se encontraron tarimas confirmadas para el turno ${turnoSeleccionado} en la fecha ${fechaSeleccionadaStr_render}.`);
        }

        // 3. FILTRADO INTELIGENTE EN MEMORIA
        let tarimasDelTurno = [];
        
        palletsSnapshot.docs.forEach(docSnap => {
            const palletData = docSnap.data();
            // Validaciones básicas
            if (!palletData || !palletData.fecha || !palletData.cajas) return;

            try {
                const palletConfirmationDate = palletData.fecha.toDate();
                const { shift, dateKey } = getWorkShiftAndDate(palletConfirmationDate);
                
                if (dateKey === fechaSeleccionadaStr_compare && shift === turnoSeleccionado) {
                    // --- AQUÍ RECUPERAMOS EL ÁREA PERDIDA ---
                    const usuario = (palletData.gafete || '').toUpperCase();
                    const areaReal = palletData.area || usersMap.get(usuario) || 'Indefinida';

                    // APLICAMOS EL FILTRO DE ÁREA AQUÍ
                    if (areaSeleccionada === 'ALL' || areaReal === areaSeleccionada) {
                        tarimasDelTurno.push({
                            folio: palletData.folio,
                            cajas: palletData.cajas,
                            // Guardamos el área calculada para usarla al buscar la orden
                            area: areaReal 
                        });
                    }
                }
            } catch (err) { console.error("Error procesando data de tarima:", err); }
        });

        if (tarimasDelTurno.length === 0) {
             throw new Error(`Se encontraron tarimas, pero ninguna coincide con el Área ${areaSeleccionada} (según el usuario que la creó).`);
        }

        totalTarimasProcesadas = tarimasDelTurno.length;
        console.log(`[TermConf] ${totalTarimasProcesadas} tarimas válidas para procesar.`);

        // 4. PROCESAR CAJAS Y ÓRDENES (LÓGICA EXISTENTE OPTIMIZADA)
        for (const tarima of tarimasDelTurno) {
            // Usamos el área que acabamos de calcular (ej. "MULTIPORT")
            const areaDeLaTarima = tarima.area; 

            for (const caja of tarima.cajas) {
                totalCajasConsultadas++;
                const numeroOrdenLimpio = caja.numeroOrden ? String(caja.numeroOrden).replace(/^0+/, '') : null;
                const codigoCajaActual = caja.codigoCaja ? String(caja.codigoCaja).trim() : null;

                if (numeroOrdenLimpio && codigoCajaActual) {
                    let orderData = null;
                    
                    // a) Revisar Caché
                    if (orderDataCache.has(numeroOrdenLimpio)) { 
                        orderData = orderDataCache.get(numeroOrdenLimpio); 
                    } else {
                        ordenesConsultadas.add(numeroOrdenLimpio);
                        try {
                            let orderDocRef;
                            // b) Buscar Orden: Si tenemos área, vamos directo. Si no, búsqueda global (más lenta)
                            if (areaDeLaTarima === 'ALL' || areaDeLaTarima === 'Indefinida') {
                                const orderQuery = await db.collectionGroup('orders').where(firebase.firestore.FieldPath.documentId(), '==', numeroOrdenLimpio).limit(1).get();
                                if (!orderQuery.empty) orderDocRef = orderQuery.docs[0];
                            } else {
                                // Búsqueda rápida directa al path del área
                                const docSnapshot = await db.collection('areas').doc(areaDeLaTarima).collection('orders').doc(numeroOrdenLimpio).get();
                                if (docSnapshot.exists) orderDocRef = docSnapshot;
                            }
                            
                            if (orderDocRef) {
                                orderData = orderDocRef.data();
                                if (orderData) { 
                                    orderDataCache.set(numeroOrdenLimpio, orderData); 
                                    ordenesConDatos.add(numeroOrdenLimpio); 
                                } else { 
                                    orderDataCache.set(numeroOrdenLimpio, null); 
                                }
                            } else { 
                                orderDataCache.set(numeroOrdenLimpio, null); 
                            }
                        } catch (error) { 
                            console.error(`[TermConf] Error buscando orden ${numeroOrdenLimpio}:`, error);
                            orderDataCache.set(numeroOrdenLimpio, null);
                        }
                    } 

                    // c) Calcular Terminaciones (Si encontramos la orden)
                    if (orderData && orderData.catalogNumber && Array.isArray(orderData.empaqueData)) {
                        const catalogNumber = orderData.catalogNumber;
                        
                        // Calculadora de fibras usando el Área Correcta
                        const fibras = calculateTerminaciones(catalogNumber, areaDeLaTarima); 

                        if (fibras > 0) {
                            const empaqueCaja = orderData.empaqueData.find(e => e.boxId === codigoCajaActual);
                            if (empaqueCaja && Array.isArray(empaqueCaja.serials)) {
                                const piezas = empaqueCaja.serials.length;
                                if (piezas > 0) {
                                    const terminacionesCaja = piezas * fibras;
                                    granTotalTerminaciones += terminacionesCaja;
                                    cajasProcesadasConTerminaciones++;
                                    
                                    // Agregar al resumen desglosado
                                    if (!summaryByOrderCatalog[numeroOrdenLimpio]) { summaryByOrderCatalog[numeroOrdenLimpio] = {}; }
                                    if (!summaryByOrderCatalog[numeroOrdenLimpio][catalogNumber]) { summaryByOrderCatalog[numeroOrdenLimpio][catalogNumber] = { piezas: 0, terminaciones: 0 }; }
                                    summaryByOrderCatalog[numeroOrdenLimpio][catalogNumber].piezas += piezas;
                                    summaryByOrderCatalog[numeroOrdenLimpio][catalogNumber].terminaciones += terminacionesCaja;
                                }
                            }
                        }
                    }
                }
            }
        }

        renderTerminacionesDashboard(granTotalTerminaciones, totalTarimasProcesadas, totalCajasConsultadas, fechaSeleccionadaStr_render, turnoSeleccionado, areaSeleccionada, summaryByOrderCatalog);

    } catch (e) {
        console.error("[TermConf] Error:", e);
        if (dashboardContainer) {
            dashboardContainer.innerHTML = `<h4 style='color: var(--danger-color); text-align: center;'>Error</h4><p style='text-align: center;'>${e.message}</p>`;
        }
    } finally {
         const currentBtn = doc('calcularTerminacionesDiaBtn');
         if (currentBtn) { currentBtn.disabled = false; currentBtn.textContent = 'Calcular Terminaciones del Turno'; }
    }
}

// --- NUEVA FUNCIÓN PARA RENDERIZAR EL DASHBOARD ---
function renderTerminacionesDashboard(totalTerminaciones, numTarimas, numCajas, fecha, turno, area, summaryData) { // <-- Añadido summaryData
    const container = doc('terminacionesDashboardContainer');
    if (!container) return; // Salir si el contenedor no existe

    const areaTexto = area === 'ALL' ? 'Todas las Áreas' : `Área ${area}`;

    // --- HTML para las tarjetas superiores (sin cambios) ---
    let dashboardHtml = `
        <h4 style="margin-top: 0; margin-bottom: 20px; text-align: center; color: var(--text-primary);">
            Resumen Terminaciones (${fecha} - Turno ${turno} - ${areaTexto})
        </h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; text-align: center; margin-bottom: 25px; border-bottom: 1px solid var(--border-color); padding-bottom: 25px;">
            <div style="background-color: var(--surface-color); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
                <span style="font-size: 1.8em; font-weight: bold; color: var(--primary-color); display: block;">
                    ${totalTerminaciones.toLocaleString()}
                </span>
                <span style="font-size: 0.9em; color: var(--text-secondary); display: block;">
                    Terminaciones Totales
                </span>
            </div>
            <div style="background-color: var(--surface-color); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
                <span style="font-size: 1.8em; font-weight: bold; color: var(--text-primary); display: block;">
                    ${numTarimas.toLocaleString()}
                </span>
                <span style="font-size: 0.9em; color: var(--text-secondary); display: block;">
                    Tarimas Confirmadas
                </span>
            </div>
             <div style="background-color: var(--surface-color); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
                <span style="font-size: 1.8em; font-weight: bold; color: var(--text-primary); display: block;">
                    ${numCajas.toLocaleString()}
                </span>
                <span style="font-size: 0.9em; color: var(--text-secondary); display: block;">
                    Cajas Registradas
                </span>
            </div>
        </div>
    `;

    // --- NUEVO: Generar HTML para el resumen por Orden/Catálogo ---
    dashboardHtml += `<h5 style="margin-top: 0; margin-bottom: 15px; text-align: center; color: var(--text-secondary);">Desglose por Orden y Catálogo</h5>`;

    const ordenes = Object.keys(summaryData).sort(); // Ordenar por número de orden

    if (ordenes.length > 0) {
        // Usaremos una tabla para mejor alineación
        dashboardHtml += `<div class="table-wrapper" style="max-height: 40vh; overflow-y: auto;">`; // Con scroll si es largo
        dashboardHtml += `<table style="width: 100%; table-layout: auto;">`; // table-layout: auto para ajustar columnas
        dashboardHtml += `<thead>
                            <tr>
                                <th style="text-align: left; padding: 8px 10px;">Orden</th>
                                <th style="text-align: left; padding: 8px 10px;">Catálogo</th>
                                <th style="text-align: right; padding: 8px 10px;">Piezas</th>
                                <th style="text-align: right; padding: 8px 10px;">Terminaciones</th>
                            </tr>
                         </thead><tbody>`;

        for (const orden of ordenes) {
            const catalogos = Object.keys(summaryData[orden]).sort(); // Ordenar catálogos dentro de la orden
            for (const catalogo of catalogos) {
                const data = summaryData[orden][catalogo];
                dashboardHtml += `<tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 6px 10px;">${orden}</td>
                                    <td style="padding: 6px 10px;">${catalogo}</td>
                                    <td style="text-align: right; padding: 6px 10px;">${data.piezas.toLocaleString()}</td>
                                    <td style="text-align: right; padding: 6px 10px; font-weight: bold;">${data.terminaciones.toLocaleString()}</td>
                                  </tr>`;
            }
        }

        dashboardHtml += `</tbody></table></div>`;
    } else {
        dashboardHtml += `<p style="text-align: center; color: var(--text-dark);">No se encontraron datos detallados para el resumen.</p>`;
    }
    // --- FIN NUEVO ---

    container.innerHTML = dashboardHtml; // Poner todo el HTML en el contenedor
    container.style.display = 'block'; // Mostrar el contenedor
}
		
// Mapa para cachear catálogos por número de orden
const orderCatalogCache = new Map();
const orderDataCache = new Map();

// Función para obtener catálogo (requiere acceso global a db y orderCatalogCache)
// --- FUERA DEL DOMContentLoaded ---

async function getCatalogNumberForOrder(orderNumber) {
    const cleanOrderNumber = String(orderNumber).replace(/^0+/, '');

    // Simplemente busca en la caché global
    if (orderCatalogCache.has(cleanOrderNumber)) {
        const cachedCatalog = orderCatalogCache.get(cleanOrderNumber);
        // console.log(`[TermConf Cache] Catálogo para ${cleanOrderNumber}: ${cachedCatalog || 'No encontrado (cached)'}`);
        return cachedCatalog; // Devuelve el catálogo o null si no se encontró previamente
    } else {
        // Si no está en caché, significa que no se encontró en la consulta inicial
        console.warn(`[TermConf Cache] Orden ${cleanOrderNumber} no encontrada en la caché inicial.`);
        return null;
    }
}

// Función para calcular terminaciones (requiere acceso global)
// --- AJUSTE: calculateTerminaciones AHORA ACEPTA UN ÁREA Y USA LONGITUD ---
function calculateTerminaciones(catalogNumber, area = 'Default') {
   if (!catalogNumber || typeof catalogNumber !== 'string' || catalogNumber.length < 4) return 0;
   const catalogUpper = catalogNumber.toUpperCase();

   // 1. PRIORIDAD: Buscar reglas en la configuración MAESTRA (Tab 5 del modal Terminaciones)
   // Esto conecta el reporte de producción con la configuración global
   let rules = [];

   // Verificamos si existe la configuración nueva
   if (params.terminaciones_config && params.terminaciones_config.fiber_rules) {
       // Busca reglas específicas del área, si no, usa las DEFAULT
       rules = params.terminaciones_config.fiber_rules[area] || params.terminaciones_config.fiber_rules['DEFAULT'] || [];
   }

   // 2. Si no hay reglas maestras, buscar en la config secundaria (legacy) por si acaso
   if (rules.length === 0 && params.terminaciones_areas_config) {
       rules = params.terminaciones_areas_config[area] || params.terminaciones_areas_config['Default'] || [];
   }

   // 3. PROCESAR REGLAS (Ordenadas por longitud de prefijo para que las más específicas ganen)
   // Nota: Normalizamos los nombres porque en una config usas 'prefix' y en otra 'prefijo'
   const sortedRules = [...rules].sort((a, b) => (b.prefix || b.prefijo || '').length - (a.prefix || a.prefijo || '').length);

   for (const rule of sortedRules) {
       const prefix = (rule.prefix || rule.prefijo || '').toUpperCase();

       // Si el catálogo empieza con el prefijo (o si el prefijo está vacío, actúa como comodín)
       if (catalogUpper.startsWith(prefix)) {
           // Definir parámetros (soportando ambas nomenclaturas de tu código)
           const start = (rule.start !== undefined ? rule.start : rule.posicion) || 4;
           // Para length: permitimos que sea 0 explícitamente
           let length = (rule.length !== undefined ? rule.length : rule.longitud);
           if (length === undefined || length === null || isNaN(length)) length = 1;

           const multiplier = parseInt(rule.multiplier) || 1;
           // Soporte para t_equals_12 o t_es_12
           const t_equals_12 = (rule.t_equals_12 !== undefined) ? rule.t_equals_12 : rule.t_es_12;

           // --- LÓGICA ESPECIAL (FIX DFB/SPECIALTY) ---
           // Si la longitud es 0, ignoramos el texto y usamos el Multiplicador como VALOR FIJO
           if (parseInt(length) === 0) {
               return multiplier;
           }

           // Extracción normal
           const startIndex = start - 1;
           const endIndex = startIndex + parseInt(length);
           const extractedStr = catalogUpper.substring(startIndex, endIndex);

           if (t_equals_12 && extractedStr === 'T') {
               return 12;
           }

           const num = parseInt(extractedStr, 10);
           const baseFibers = isNaN(num) ? 0 : num;

           return baseFibers * multiplier;
       }
   }

   // 4. FALLBACK (Lógica por defecto si no hay reglas coincidentes)
   // El clásico "4to dígito" si no se encontró nada arriba
   const digit = catalogNumber.substring(3, 4).toUpperCase();
   if (digit === 'T') return 12;
   if (digit === 'G') return 24;
   const num = parseInt(digit, 10);
   return isNaN(num) ? 0 : num;
}

// --- ¡NUEVA FUNCIÓN! Modal de Configuración de Áreas ---
function showAreaConfigModal() {
    const config = params.terminaciones_areas_config || {};
    // Clonamos las opciones del dropdown de áreas que ya existe en la vista
    const areaOptions = doc('prodTarimas_area').innerHTML; 

    const content = `
        <div class="control-group">
            <label for="configAreaSelect">Seleccionar Área para Configurar</label>
            <select id="configAreaSelect" class="control-group select">
                ${areaOptions
                    .replace('<option value="ALL">Todas las Áreas</option>', '')
                    .replace('value="" disabled', 'value="Default"')
                    .replace('Cargando áreas...', 'Default (Reglas Globales)')
                }
            </select>
        </div>
        <hr style="border-color: var(--border-color); margin: 16px 0;">
        <p style="text-align:center; color: var(--text-dark); font-size: 0.9em;">Define reglas de prefijo para los catálogos de esta área. La app usará la primera regla que coincida (la más específica). Si ninguna coincide, usará la lógica por defecto.</p>
        <ul class="param-list" id="areaRulesList" style="max-height: 40vh; overflow-y: auto;">
            </ul>
        <button id="addAreaRuleBtn" class="btn btn-glass" style="width: auto; padding: 8px 16px;">Añadir Regla</button>
        <button id="saveAreaConfigBtn" class="btn" style="margin-top: 20px; width: 100%;">Guardar Configuración de Áreas</button>
    `;
    showModal('Configurar Cálculo de Fibras por Área', content);

    const areaSelect = doc('configAreaSelect');
    areaSelect.addEventListener('change', () => {
        renderAreaRules(areaSelect.value);
    });
    
    doc('addAreaRuleBtn').addEventListener('click', () => {
        const list = doc('areaRulesList');
        // Por defecto, la regla comodín (sin prefijo)
        list.insertAdjacentHTML('beforeend', createAreaRuleHTML({ prefijo: "", posicion: 4, t_es_12: true }));
    });
    
    doc('saveAreaConfigBtn').addEventListener('click', saveAreaConfig);
    
    renderAreaRules(areaSelect.value);
}

// --- ¡NUEVA FUNCIÓN! Helper para el modal de áreas ---
function renderAreaRules(areaKey) {
    const list = doc('areaRulesList');
    if (!list) return;
    
    const config = params.terminaciones_areas_config || {};
    const rules = config[areaKey] || [];
    
    list.innerHTML = rules.map(rule => createAreaRuleHTML(rule)).join('');
    if (rules.length === 0) {
        list.innerHTML = `<p style="text-align:center; color: var(--text-dark);">No hay reglas para esta área. Se usará la lógica por defecto (4to dígito).</p>`;
    }
}

// --- ¡NUEVA FUNCIÓN! Helper para el modal de áreas ---
function createAreaRuleHTML(rule) {
    return `
    <li class="param-item" style="grid-template-columns: 2fr 1fr 1fr auto auto; gap: 12px;">
        <input type="text" class="rule-prefix" placeholder="Prefijo (ej: 123-)" value="${rule.prefijo || ''}">
        <input type="number" class="rule-pos" placeholder="Pos. Inicio" value="${rule.posicion || 4}" min="1" style="text-align: center;">
        <input type="number" class="rule-length" placeholder="Cant. Dígitos" value="${rule.longitud || 1}" min="1" style="text-align: center;">
        <label style="display: flex; align-items: center; gap: 5px; font-size: 0.9em; justify-content: center; color: var(--text-secondary); cursor: pointer;">
            <input type="checkbox" class="rule-t" ${rule.t_es_12 ? 'checked' : ''}> 'T' es 12
        </label>
        <button class="btn btn-danger" onclick="this.parentElement.remove()" style="padding: 6px 10px; font-size: 0.9rem;">X</button>
    </li>
    `;
}
// --- ¡NUEVA FUNCIÓN! Guardar la configuración de áreas ---
async function saveAreaConfig() {
    const modalBody = doc('modalBody');
    const selectedArea = doc('configAreaSelect').value;
    if (!selectedArea) {
        showModal('Error', '<p>No se seleccionó ningún área.</p>');
        return;
    }

    const rules = Array.from(modalBody.querySelectorAll('#areaRulesList .param-item')).map(item => ({
        prefijo: item.querySelector('.rule-prefix').value.trim().toUpperCase(),
        posicion: parseInt(item.querySelector('.rule-pos').value, 10) || 4,
        longitud: parseInt(item.querySelector('.rule-length').value, 10) || 1, // <-- ¡AQUÍ ESTÁ EL CAMBIO!
        t_es_12: item.querySelector('.rule-t').checked
    }));

    if (!params.terminaciones_areas_config) {
        params.terminaciones_areas_config = {};
    }
    params.terminaciones_areas_config[selectedArea] = rules;

    try {
        await db.collection('report_configs').doc('terminaciones_areas_params').set(params.terminaciones_areas_config);
        showModal('Éxito', `<p>Configuración para el área <strong>${selectedArea}</strong> guardada.</p>`);
    } catch (e) {
        console.error("Error guardando config de áreas:", e);
        showModal('Error', '<p>No se pudo guardar la configuración en la base de datos.</p>');
    }
}

// =======================================================================================
// --- INICIO: LÓGICA REPORTE ÓRDENES DEL DÍA (FINAL - SEPARACIÓN SAP/APP) ---
// =======================================================================================

// 1. LISTENER BOTONES
doc('reporteOrdenesDiaBtn').addEventListener('click', () => {
    switchView('ordenesDia');
    loadAreasForOrdenesDia();
    if(!doc('ordenesDia_fecha').value) {
        const now = new Date();
        const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        doc('ordenesDia_fecha').value = localDate;
    }
});

doc('consultarOrdenesDiaBtn').addEventListener('click', consultarOrdenesDelDia);

// 2. CARGAR ÁREAS
async function loadAreasForOrdenesDia() {
    const areaSelect = doc('ordenesDia_area');
    if (!areaSelect) return;
    if(areaSelect.options.length > 1) return;

    areaSelect.innerHTML = '<option value="" disabled selected>Cargando...</option>';
    try {
        const snapshot = await db.collection('areas').get();
        areaSelect.innerHTML = '<option value="" disabled selected>Seleccione Área</option>';
        const areas = [];
        snapshot.forEach(docSnap => { if (docSnap.id !== 'CONFIG') areas.push(docSnap.id); });
        areas.sort();
        areas.forEach(area => {
            const opt = document.createElement('option');
            opt.value = area;
            opt.textContent = area;
            areaSelect.appendChild(opt);
        });
        if (areas.includes('MULTIPORT')) areaSelect.value = 'MULTIPORT';
    } catch (e) {
        console.error("Error cargando áreas", e);
        areaSelect.innerHTML = '<option value="" disabled>Error</option>';
    }
}

// 3. UTILIDAD FECHA
function normalizeDate(input) {
    if (!input) return null;
    if (typeof input === 'number') {
        const date = new Date(Math.round((input - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    if (input instanceof Date) return input.toISOString().split('T')[0];
    if (typeof input === 'string') {
        if (input.includes('/')) {
            const parts = input.split('/');
            if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        }
        return input.substring(0, 10);
    }
    if (input && typeof input.toDate === 'function') {
        return input.toDate().toISOString().split('T')[0];
    }
    return null;
}

function formatShortDateTime(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hour}:${minute}`;
}


 // 4. CONSULTA HÍBRIDA OPTIMIZADA (FRANCOTIRADOR + DESGLOSE FIBRAS)
async function consultarOrdenesDelDia() {
    const fechaInput = doc('ordenesDia_fecha').value;
    const areaInput = doc('ordenesDia_area').value;

    if (!fechaInput || !areaInput) {
        showModal('Datos Requeridos', '<p>Seleccione fecha y área.</p>');
        return;
    }

    const btn = doc('consultarOrdenesDiaBtn');
    btn.disabled = true;
    btn.textContent = 'Consultando puntual...';

    const tbody = doc('dataTableOrdenesDia').querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Consultando SAP y Datos Específicos...</td></tr>';
    
    ['kpiOrdersTotal', 'kpiOrdersClosed', 'kpiOrdersMissing', 'kpiTerminacionesMissing'].forEach(id => {
        const el = doc(id); if(el) el.textContent = '-';
    });

    try {
        console.log(`>>> CONSULTA SMART: ${areaInput} | ${fechaInput} <<<`);

        // --- PASO A: OBTENER BASE MAESTRA SAP (EL MAPA DEL TESORO) ---
        const sapHistoricoRef = db.collection('areas').doc(areaInput).collection('sap_historico');
        const sapSnapshot = await sapHistoricoRef.get();

        const sapMap = new Map();
        sapSnapshot.forEach(doc => {
            const data = doc.data();
            const sapDate = normalizeDate(data['Finish']);
            if (sapDate === fechaInput) {
                // Limpiamos el ID (quitamos ceros a la izquierda) para que coincida con FWD
                const cleanId = String(data['Orden'] || doc.id).trim().replace(/^0+/, '');
                sapMap.set(cleanId, data);
            }
        });

        if (sapMap.size === 0) {
            renderOrdenesDiaTable([]);
            if(doc('kpiTerminacionesMissing')) doc('kpiTerminacionesMissing').textContent = '0';
            ['kpiOrdersTotal', 'kpiOrdersClosed', 'kpiOrdersMissing'].forEach(id => doc(id).textContent = '0');
            alert(`No hay órdenes programadas en SAP para la fecha ${fechaInput}.`);
            btn.disabled = false; btn.textContent = 'Consultar Órdenes';
            return;
        }

        // --- PASO B: OPTIMIZACIÓN FRANCOTIRADOR (SOLO PEDIR LO QUE NECESITAMOS) ---
        // En lugar de pedir TODAS las órdenes, pedimos solo las IDs que encontramos en SAP
        const sapIds = Array.from(sapMap.keys());
        const ordersCollectionRef = db.collection('areas').doc(areaInput).collection('orders');
        
        // Hacemos peticiones individuales en paralelo (Mucho más barato que bajar toda la colección)
        const fwdPromises = sapIds.map(id => ordersCollectionRef.doc(id).get());
        const fwdSnapshots = await Promise.all(fwdPromises);

        const fwdMap = new Map();
        fwdSnapshots.forEach(docSnap => {
            if (docSnap.exists) {
                fwdMap.set(docSnap.id, docSnap.data());
            }
        });

        // --- PASO C: CONSTRUIR REPORTE Y STATS ---
        let ordenesFinales = [];
        
        let stats = { 
            total: 0, 
            cerradas: 0, 
            faltantes: 0,
            terminacionesPendientes: 0,
            // Objeto para guardar el desglose por fibra
            byFibra: {} 
        };

        sapMap.forEach((sapData, docId) => {
            const liveData = fwdMap.get(docId); 

            // Datos Base
            const catalogo = sapData['Catalogo'] || 'N/A';
            const material = sapData['Material'] || 'N/A';
            const specialStock = sapData['Special Stock'] || 'N/A';

            // Totales
            const totalOrden = Number(sapData['Total orden']) || 0;
            const totalConfirmadoSAP = Number(sapData['Total confirmado']) || 0;

            let totalConfirmadoFWD = 0;
            if (liveData) {
                totalConfirmadoFWD = Number(liveData.packedQty) || 0;
                if (totalConfirmadoFWD === 0 && liveData.empaqueData) {
                    let empaqueArray = [];
                    if(Array.isArray(liveData.empaqueData)) empaqueArray = liveData.empaqueData;
                    else if(typeof liveData.empaqueData === 'object') empaqueArray = Object.values(liveData.empaqueData);
                    empaqueArray.forEach(box => { if(box.serials) totalConfirmadoFWD += box.serials.length; });
                }
            }

            // Cálculos
            let faltanteSAP = 0;
            if (sapData['Faltante'] !== undefined) {
                faltanteSAP = Number(sapData['Faltante']);
            } else {
                faltanteSAP = Math.max(0, totalOrden - totalConfirmadoSAP);
            }

            const faltanteFWD = Math.max(0, totalOrden - totalConfirmadoFWD);

            // Terminaciones
            const char = catalogo.substring(3, 4).toUpperCase();
            const fibras = (char === 'T') ? 12 : (parseInt(char, 10) || 0);
            const termFaltante = faltanteSAP * fibras; 

            const status = (faltanteFWD === 0 && totalOrden > 0) ? 'Completa' : 'Incompleta';

            ordenesFinales.push({
                id: docId,
                catalogo, material, specialStock, fibras, termFaltante,
                totalOrden, totalConfirmadoSAP, faltanteSAP, faltanteFWD, status,
                rawData: liveData || { packedQty: 0, orderQty: totalOrden, empaqueData: [], rastreoData: [] } 
            });

            // --- SUMAS Y DESGLOSE ---
            stats.total++;
            stats.terminacionesPendientes += termFaltante;

            // Desglose por fibra (solo si hay faltante SAP)
            if (termFaltante > 0) {
                const labelFibra = `${fibras} Fibras`;
                stats.byFibra[labelFibra] = (stats.byFibra[labelFibra] || 0) + termFaltante;
            }

            if (faltanteFWD === 0 && totalOrden > 0) stats.cerradas++;
            else stats.faltantes++;
        });

        // Renderizado
        if (ordenesFinales.length === 0) {
            renderOrdenesDiaTable([]);
        } else {
            renderOrdenesDiaTable(ordenesFinales);
        }

        doc('kpiOrdersTotal').textContent = stats.total;
        doc('kpiOrdersClosed').textContent = stats.cerradas;
        doc('kpiOrdersMissing').textContent = stats.faltantes;
        
        // --- KPI TERMINACIONES INTERACTIVO ---
        const kpiTermEl = doc('kpiTerminacionesMissing');
        if(kpiTermEl) {
            kpiTermEl.textContent = stats.terminacionesPendientes.toLocaleString();
            
            // Hacemos que la tarjeta sea clickeable (buscamos el contenedor padre .kpi-card)
            const cardContainer = kpiTermEl.closest('.kpi-card');
            if (cardContainer) {
                cardContainer.style.cursor = 'pointer';
                cardContainer.title = "Clic para ver desglose por fibra";
                // Limpiamos listeners previos clonando el nodo (truco rápido) o reasignando onclick
                cardContainer.onclick = () => showTerminacionesModal(stats.byFibra, stats.terminacionesPendientes);
            }
        }

    } catch (e) {
        console.error("Error consulta:", e);
        showModal('Error', `<p>${e.message}</p>`);
        tbody.innerHTML = '<tr><td colspan="11">Error al procesar.</td></tr>';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Consultar Órdenes';
    }
}

// --- NUEVA FUNCIÓN: MODAL DESGLOSE POR FIBRA ---
function showTerminacionesModal(desgloseData, total) {
    // Si no hay datos, aviso simple
    if (Object.keys(desgloseData).length === 0) {
        showModal('Desglose de Terminaciones', '<p style="text-align:center;">No hay terminaciones pendientes en SAP.</p>');
        return;
    }

    // Ordenamos las llaves (4 Fibras, 6 Fibras...) numéricamente
    const sortedKeys = Object.keys(desgloseData).sort((a, b) => parseInt(a) - parseInt(b));

    let listHtml = '<ul class="param-list" style="margin-top:10px;">';
    
    sortedKeys.forEach(key => {
        const cantidad = desgloseData[key];
        const porcentaje = total > 0 ? Math.round((cantidad / total) * 100) : 0;
        
        // Barra de progreso visual
        listHtml += `
            <li style="display:block; padding:12px; margin-bottom:8px; background:var(--surface-hover-color); border-radius:8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-weight:bold; font-size:1.1rem;">
                    <span>${key}</span>
                    <span>${cantidad.toLocaleString()}</span>
                </div>
                <div style="width:100%; height:8px; background:rgba(0,0,0,0.2); border-radius:4px; overflow:hidden;">
                    <div style="width:${porcentaje}%; height:100%; background:var(--primary-color);"></div>
                </div>
                <div style="text-align:right; font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
                    ${porcentaje}% del total
                </div>
            </li>
        `;
    });
    listHtml += '</ul>';

    const modalBody = `
        <div style="text-align:center; margin-bottom:15px;">
            <h2 style="margin:0; color:var(--text-primary); font-size:2.5rem;">${total.toLocaleString()}</h2>
            <small style="color:var(--text-secondary);">Total Terminaciones Pendientes (SAP)</small>
        </div>
        <h5 style="border-bottom:1px solid var(--border-color); padding-bottom:5px; margin-bottom:10px;">Desglose por Tipo de Fibra</h5>
        ${listHtml}
    `;

    showModal('Planeación de Turno: Terminaciones', modalBody);
}
// 5. RENDERIZADO TABLA (VERSIÓN FINAL LIMPIA: 11 COLUMNAS)
function renderOrdenesDiaTable(data) {
    const table = doc('dataTableOrdenesDia');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    // 1. REGENERAR ENCABEZADOS (11 Columnas exactas)
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>Orden</th>
                <th>Catálogo</th>
                <th>Material</th>
                <th>Special Stock</th>
                <th>Fibras</th>
                <th>Term. (Falt)</th>
                <th>Total Orden</th>
                <th>Total Conf.</th>
                <th>Faltante SAP</th>
                <th>Faltante FWD</th>
                <th>Status</th>
            </tr>
        `;
    }

    if (!data || data.length === 0) {
        // Ajustamos colspan a 11
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Sin datos para mostrar.</td></tr>';
        return;
    }

    // Ordenar Ascendente por Faltante SAP
    data.sort((a, b) => a.faltanteSAP - b.faltanteSAP);

    let html = '';
    data.forEach((row, index) => {
        // Lógica de colores
        const isCompleteFWD = row.faltanteFWD === 0;
        const trClass = isCompleteFWD ? 'row-today' : '';

        const btnColor = isCompleteFWD ? 'var(--success-color)' : '#f59e0b';
        const hasLiveData = !!row.rawData;
        const btnOpacity = hasLiveData ? '1' : '0.5';

        // Destacar si FWD va mejor que SAP (Verde) o si falta (Rojo/Naranja)
        const colorFaltanteFWD = (row.faltanteFWD === 0 && row.faltanteSAP > 0) ? 'var(--success-color)' : 'inherit';

        html += `<tr class="${trClass}">
            <td style="font-weight:bold;">${row.id}</td>
            <td>${row.catalogo}</td>
            <td>${row.material}</td>
            <td>${row.specialStock}</td>
            <td style="text-align:center;">${row.fibras}</td>
            <td style="text-align:center; font-weight:bold;">${row.termFaltante.toLocaleString()}</td>
            <td style="text-align:center;">${row.totalOrden}</td>
            <td style="text-align:center;">${row.totalConfirmadoSAP}</td>

            <td style="text-align:center; font-weight:bold;">${row.faltanteSAP}</td>

            <td style="text-align:center; font-weight:bold; color:${colorFaltanteFWD};">${row.faltanteFWD}</td>

            <td style="text-align:center;">
                <button class="btn-status" data-index="${index}" style="opacity:${btnOpacity}; border-color:${btnColor}; color:${btnColor === '#f59e0b' ? 'var(--text-primary)' : 'white'}; background-color:${btnColor === '#f59e0b' ? 'transparent' : btnColor}; padding: 4px 8px; font-size: 0.75rem;">
                    Ver Estatus
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;

    // Listeners del botón
    table.querySelectorAll('.btn-status').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.dataset.index;
            if (data[idx].rawData) mostrarModalEstatusOrden(data[idx]);
            else showModal('Aviso', '<p>Orden en SAP sin registros en App.</p>');
        });
    });
}
		
// --- VARIABLES GLOBALES PARA EL CHART DEL MODAL ---
let modalChartInstance = null; // Para poder destruirlo si se abre otro

// --- MODAL DE ESTATUS DETALLADO (DISEÑO GRID HORIZONTAL) ---
async function mostrarModalEstatusOrden(ordenData) {
    const rawData = ordenData.rawData; 
    
    if (!rawData) {
        showModal('Sin Datos', '<p>Esta orden aún no tiene registros de actividad en la aplicación.</p>');
        return;
    }

    const empaqueData = rawData.empaqueData || [];
    const rastreoData = rawData.rastreoData || []; 

    // --- LÓGICA DE DATOS (IGUAL QUE ANTES) ---
    let appPackedQty = Number(rawData.packedQty) || 0;
    if (appPackedQty === 0 && Array.isArray(empaqueData)) {
        empaqueData.forEach(box => { if(Array.isArray(box.serials)) appPackedQty += box.serials.length; });
    }
    const appOrderQty = Number(rawData.orderQty) || Number(ordenData.totalOrden) || 0;

    const registeredPackers = params.produccion_hora_config.packers || [];
    const findLineByPacker = (id) => {
        if (!id) return null;
        const found = registeredPackers.find(p => p.id === String(id).trim().toUpperCase());
        return found ? `Línea ${found.linea} (${found.turno})` : null;
    };

    let lastPacker = { name: 'Sin datos', time: new Date(0), line: 'N/A' };
    const hourlyCounts = {};
    let minHour = 24, maxHour = 0;

    let empaqueArray = Array.isArray(empaqueData) ? empaqueData : [];
    if (empaqueData && typeof empaqueData.forEach === 'function' && !Array.isArray(empaqueData)) {
        empaqueData.forEach((val) => empaqueArray.push(val));
    }

    empaqueArray.forEach(box => {
        if (box.serials && Array.isArray(box.serials)) {
            box.serials.forEach(item => {
                const packedDateSerial = item['Finish Packed Date'];
                let packedDate = null;
                if (typeof packedDateSerial === 'number') {
                    const baseDate = new Date(Math.round((packedDateSerial - 25569) * 86400000));
                    packedDate = new Date(baseDate.getTime() + (baseDate.getTimezoneOffset() * 60000));
                } else if (packedDateSerial) packedDate = new Date(packedDateSerial);

                if (packedDate && !isNaN(packedDate)) {
                    if (packedDate > lastPacker.time) {
                        lastPacker.time = packedDate;
                        lastPacker.name = item['Employee ID'] || 'Desconocido';
                        lastPacker.line = findLineByPacker(lastPacker.name) || item['Line'] || item['Linea'] || item['Estación'] || 'N/A';
                    }
                    const hour = packedDate.getHours();
                    if (hour < minHour) minHour = hour;
                    if (hour > maxHour) maxHour = hour;
                    hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
                }
            });
        }
    });

    const chartLabels = [], chartData = [];
    if (maxHour >= minHour) {
        for (let h = minHour; h <= maxHour; h++) {
            chartLabels.push(`${String(h).padStart(2, '0')}:00`);
            chartData.push(hourlyCounts[h] || 0);
        }
    }

    const groupedLines = {};
    const now = new Date();
    if (Array.isArray(rastreoData)) {
        rastreoData.forEach(row => {
            if (String(row['Is Scrap'] || '').trim().toUpperCase() === 'X') return;
            const lineName = row.Line || row.Linea || row.Station || 'Línea Desconocida';
            const serial = row['Product Serial Number'] || 'S#?';
            const station = row.Station || 'Estación?';
            
            let dateRegistered = null;
            if (typeof row['Date Registered'] === 'number') {
                const baseDate = new Date(Math.round((row['Date Registered'] - 25569) * 86400000));
                dateRegistered = new Date(baseDate.getTime() + (baseDate.getTimezoneOffset() * 60000));
            } else if (row['Date Registered']) dateRegistered = new Date(row['Date Registered']);
            else if (row.Date) dateRegistered = (typeof row.Date.toDate === 'function') ? row.Date.toDate() : new Date(row.Date);

            let dotClass = 'dot-yellow', timeText = 'S/F';
            if (dateRegistered && !isNaN(dateRegistered)) {
                const ageInHours = (now - dateRegistered) / 3600000;
                if (ageInHours > 25) { dotClass = 'dot-orange'; timeText = '> 25h'; }
                else if (ageInHours > 8) { dotClass = 'dot-yellow'; timeText = '> 8h'; }
                else { dotClass = 'dot-green'; timeText = formatShortDateTime(dateRegistered); }
            }
            if (!groupedLines[lineName]) groupedLines[lineName] = [];
            groupedLines[lineName].push({ serial, station, timeText, dotClass, dateObj: dateRegistered });
        });
    }

    let cardsHtml = '<div class="line-status-grid">';
    const lines = Object.keys(groupedLines).sort();
    if (lines.length === 0) cardsHtml += '<p style="text-align:center; color:var(--text-secondary); margin-top:20px;">No hay seriales activos en rastreo.</p>';
    else {
        lines.forEach(line => {
            const items = groupedLines[line];
            items.sort((a, b) => (b.dateObj || 0) - (a.dateObj || 0));
            let itemsListHtml = '';
            items.forEach(item => {
                itemsListHtml += `<li class="line-item"><span class="status-indicator-dot ${item.dotClass}"></span><div class="item-details"><div class="item-top"><span>${item.serial}</span><span style="font-size:0.8em; opacity:0.8;">${item.timeText}</span></div><div class="item-bottom"><span>${item.station}</span></div></div></li>`;
            });
            cardsHtml += `<div class="line-detail-card"><div class="line-card-header"><span>${line}</span><span style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:12px; font-size:0.85em;">${items.length} pzas</span></div><ul class="line-items-list">${itemsListHtml}</ul></div>`;
        });
    }
    cardsHtml += '</div>';

    const lastPackerTimeStr = lastPacker.time.getTime() > 0 ? lastPacker.time.toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'N/A';
    const colorProgreso = (appPackedQty >= appOrderQty && appOrderQty > 0) ? 'color:var(--success-color);' : 'color:var(--danger-color);';

    // --- E. HTML ESTRUCTURADO (GRID) ---
    const modalBody = `
        <div class="modal-body-grid">
            <div class="modal-header-section">
                <div>
                    <h4 style="margin:0; color:var(--text-primary); font-size:1.1rem;">Orden: ${ordenData.id}</h4>
                    <small style="color:var(--text-secondary); font-size:0.9rem;">${ordenData.catalogo}</small>
                </div>
                <div style="text-align:right;">
                    <span style="font-weight:bold; font-size:1.4rem; ${colorProgreso}">${appPackedQty} / ${appOrderQty}</span>
                    <br><small style="font-size:0.8rem;">Progreso Real</small>
                </div>
            </div>

            <div class="modal-left-column">
                <div style="margin-bottom: 20px;">
                    <h5 style="margin:0 0 10px 0; color:var(--text-secondary);">Ritmo de Empaque (Pzas/Hora)</h5>
                    <div class="modal-chart-container">
                        <canvas id="modalHourlyChart"></canvas>
                    </div>
                </div>

                <div class="last-packer-info">
                    <h5 style="margin:0 0 8px 0; color:var(--primary-color);">Último Empaque Detectado</h5>
                    <div style="font-size: 0.9rem;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>Usuario:</span> <strong>${lastPacker.name}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>Hora:</span> <strong>${lastPackerTimeStr}</strong>
                        </div>
                        <div style="border-top:1px solid rgba(0,0,0,0.1); padding-top:4px; margin-top:4px;">
                            <span style="color:var(--text-secondary); font-size:0.85em;">Línea:</span> 
                            <strong>${lastPacker.line}</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-right-column">
                <h5 style="margin:0 0 15px 0; color:var(--text-secondary); position:sticky; top:0; background:var(--surface-color); padding-bottom:5px; z-index:10;">
                    Detalle de Rastreo (Activos: ${lines.reduce((acc, l) => acc + groupedLines[l].length, 0)})
                </h5>
                ${cardsHtml}
            </div>
        </div>
    `;

    // 1. Mostrar Modal y añadir clase 'modal-wide'
    showModal('Detalle de Estatus de Orden', modalBody);
    doc('modalContent').classList.add('modal-wide'); 

    // 2. Renderizar Gráfica
    setTimeout(() => renderModalChart(chartLabels, chartData), 100);

    // 3. Limpiar clase 'modal-wide' al cerrar
    const cleanup = () => {
        doc('modalContent').classList.remove('modal-wide');
        doc('modalClose').removeEventListener('click', cleanup);
    };
    doc('modalClose').addEventListener('click', cleanup);
    doc('modalOverlay').addEventListener('click', (e) => { if(e.target === doc('modalOverlay')) cleanup(); });
}

// --- FUNCIÓN HELPER PARA DIBUJAR LA GRÁFICA ---
function renderModalChart(labels, data) {
    const ctx = document.getElementById('modalHourlyChart');
    if (!ctx) return;

    // Destruir gráfica anterior si existe para evitar superposiciones
    if (modalChartInstance) {
        modalChartInstance.destroy();
        modalChartInstance = null;
    }

    if (data.length === 0) {
        // Si no hay datos, mostrar texto en el canvas (opcional)
        return;
    }

    // Colores según tema (puedes ajustar)
    const barColor = getComputedStyle(document.body).getPropertyValue('--primary-color').trim() || '#34D399';
    const gridColor = 'rgba(255, 255, 255, 0.1)';
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();

    modalChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Piezas Empacadas',
                data: data,
                backgroundColor: barColor,
                borderRadius: 4,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, // No necesitamos leyenda, es obvio
                title: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.raw} piezas`;
                        }
                    }
                },
                datalabels: { // Si usas el plugin de etiquetas
                    display: true,
                    color: textColor,
                    anchor: 'end',
                    align: 'top',
                    offset: -2,
                    font: { size: 10, weight: 'bold' },
                    formatter: (value) => value > 0 ? value : '' // Solo muestra si > 0
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: gridColor, drawBorder: false },
                    ticks: { color: textColor, font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { size: 10 } }
                }
            }
        },
        plugins: [ChartDataLabels] // Asegúrate de tener este plugin cargado en el HTML, si no, bórralo
    });
}

// =======================================================================================
// --- FIN: LÓGICA REPORTE ÓRDENES DEL DÍA ---
// =======================================================================================
// =================================================================
// --- NUEVA FUNCIÓN: PROYECCIÓN DE TERMINACIONES (PIVOT TABLE) ---
// =================================================================

// 1. Listener del Botón
const btnProyeccion = document.getElementById('btnProyeccionTerminaciones');
if (btnProyeccion) {
    btnProyeccion.addEventListener('click', abrirModalProyeccion);
}

// 2. Abrir Modal de Fechas
function abrirModalProyeccion() {
    const today = new Date().toISOString().split('T')[0];
    
    // Obtenemos el área que ya estaba seleccionada en la vista principal para ahorrar tiempo
    const areaActual = document.getElementById('ordenesDia_area').value || '';

    const content = `
        <div class="control-group">
            <label>Área a Consultar</label>
            <select id="proyeccion_area" class="filter-input" style="width:100%; padding:8px;">
                ${document.getElementById('ordenesDia_area').innerHTML}
            </select>
        </div>
        <div class="date-range-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
            <div>
                <label>Fecha Inicio</label>
                <input type="date" id="proyeccion_f_inicio" value="${today}" style="width:100%;">
            </div>
            <div>
                <label>Fecha Fin</label>
                <input type="date" id="proyeccion_f_fin" value="${today}" style="width:100%;">
            </div>
        </div>
        <button id="btnGenerarPivot" class="btn" style="width:100%; margin-top: 20px;">Generar Tabla Pivote</button>
    `;

    showModal('Proyección de Terminaciones', content);
    
    // Setear el área que ya tenía seleccionada el usuario
    if(areaActual) document.getElementById('proyeccion_area').value = areaActual;

    document.getElementById('btnGenerarPivot').addEventListener('click', calcularProyeccionTerminaciones);
}

// 3. Calcular y Generar Reporte
// =================================================================
// --- BLOQUE FINAL: PROYECCIÓN DE FALTANTES SAP (LÓGICA + VISTA) ---
// =================================================================

async function calcularProyeccionTerminaciones() {
    const fInicio = document.getElementById('proyeccion_f_inicio').value;
    const fFin = document.getElementById('proyeccion_f_fin').value;
    const area = document.getElementById('proyeccion_area').value;
    const btn = document.getElementById('btnGenerarPivot');

    if (!fInicio || !fFin || !area) {
        alert("Selecciona rango de fechas y área.");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Consultando SAP...";

    try {
        // 1. CONVERTIR FECHAS A SERIAL EXCEL
        // (Lógica necesaria para buscar en sap_historico)
        const jsDateToExcel = (dateString) => {
            const date = new Date(dateString + 'T00:00:00');
            const offset = date.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(date.getTime() - offset);
            return (adjustedDate.getTime() / 86400000) + 25569;
        };

        const startSerial = Math.floor(jsDateToExcel(fInicio));
        const endSerial = Math.floor(jsDateToExcel(fFin)) + 1;

        // 2. CONSULTAR SAP HISTÓRICO
        let query = db.collection('areas').doc(area).collection('sap_historico');
        
        // Buscamos por la columna 'Finish' (Fecha promesa SAP)
        query = query.where('Finish', '>=', startSerial).where('Finish', '<', endSerial);

        const snapshot = await query.get();

        if (snapshot.empty) {
            showModal('Sin Datos SAP', '<p>No se encontraron órdenes pendientes en SAP para este rango.</p>');
            return;
        }

        // 3. PROCESAR Y AGRUPAR
        const pivotData = {}; 
        const fiberTypes = new Set(); 

        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Convertir Serial a Fecha legible
            const fechaObj = excelSerialToDateObject(data['Finish']);
            
            if (fechaObj) {
                // Clave para la fila: 05/01/2026
                const fechaKey = fechaObj.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
                
                // Dato duro de SAP
                const faltanteSAP = Number(data['Faltante']) || 0; 

                // Solo nos importa si hay trabajo pendiente
                if (faltanteSAP > 0) {
                    const catalogo = data['Catalogo'] || '';
                    
                    // Calcular Fibras (usa tu función helper si existe, si no, usa lógica básica)
                    let numFibras = 0;
                    if (typeof calculateTerminaciones === 'function') {
                        numFibras = calculateTerminaciones(catalogo, area); 
                    } else {
                        const char = catalogo.substring(3, 4).toUpperCase();
                        numFibras = (char === 'T') ? 12 : (parseInt(char, 10) || 0);
                    }

                    if (numFibras > 0) {
                        const labelFibra = `${numFibras} Fibras`;
                        fiberTypes.add(labelFibra);
                        
                        // CÁLCULO FINAL: Faltante * Fibras
                        const terminacionesPendientes = numFibras * faltanteSAP;

                        if (!pivotData[fechaKey]) pivotData[fechaKey] = {};
                        if (!pivotData[fechaKey][labelFibra]) pivotData[fechaKey][labelFibra] = 0;
                        
                        pivotData[fechaKey][labelFibra] += terminacionesPendientes;
                    }
                }
            }
        });

        // 4. RENDERIZAR
        renderPivotTable(pivotData, Array.from(fiberTypes).sort((a,b) => parseInt(a)-parseInt(b)));

    } catch (e) {
        console.error("Error proyección SAP:", e);
        if (e.code === 'failed-precondition') {
             showModal('Falta Índice', '<p>Firebase necesita un índice compuesto (Finish ASC) para esta consulta. Revisa la consola (F12).</p>');
        } else {
             alert("Error al consultar datos: " + e.message);
        }
    } finally {
        btn.disabled = false;
        btn.textContent = "Generar Tabla Pivote";
    }
}


   // --- FUNCIÓN DE VISUALIZACIÓN (DISEÑO LIMPIO Y PROFESIONAL) ---
function renderPivotTable(pivotData, fiberColumns) {
    const sortedDates = Object.keys(pivotData).sort((a, b) => {
        const da = new Date(a.split('/').reverse().join('-'));
        const db = new Date(b.split('/').reverse().join('-'));
        return da - db;
    });

    if (sortedDates.length === 0) {
        showModal('Todo Completo', '<p style="text-align:center; padding: 20px;">✅ No hay faltantes programados para este periodo.</p>');
        return;
    }

    const colTotals = {};
    fiberColumns.forEach(f => colTotals[f] = 0);
    let grandTotalGeneral = 0;

    // --- DISEÑO EJECUTIVO ---
    let html = `
        <div style="margin-bottom: 20px; text-align: left; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
            <h3 style="margin: 0; color: var(--text-primary); font-size: 1.2rem;">Proyección de Carga de Trabajo (SAP)</h3>
            <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-top: 4px;">
                Generado el: ${new Date().toLocaleString()}
            </span>
        </div>

        <div class="table-wrapper" style="max-height: 60vh; border-radius: 8px; border: 1px solid var(--border-color); overflow: hidden;">
            <table class="pivot-table" style="width:100%; border-collapse:collapse; font-size:0.9em;">
                <thead style="background: var(--surface-hover-color);">
                    <tr>
                        <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem;">Fecha Entrega</th>
                        ${fiberColumns.map(f => `<th style="padding: 12px; text-align: center; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem;">${f}</th>`).join('')}
                        <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: var(--text-primary); text-transform: uppercase; font-size: 0.75rem;">Total Pendiente</th>
                    </tr>
                </thead>
                <tbody style="background: var(--surface-color);">
    `;

    sortedDates.forEach(date => {
        const rowData = pivotData[date];
        let rowTotal = 0;
        
        html += `<tr style="border-bottom: 1px solid var(--border-color); transition: background 0.2s;">`;
        html += `<td style="padding: 12px 16px; font-weight: 500; color: var(--text-primary);">${date}</td>`;
        
        fiberColumns.forEach(fibra => {
            const val = rowData[fibra] || 0;
            rowTotal += val;
            colTotals[fibra] += val;
            
            const style = val === 0 ? 'color: var(--text-secondary); opacity: 0.3;' : 'color: var(--text-primary); font-weight: 500;';
            html += `<td style="padding: 12px; text-align: center; ${style}">${val.toLocaleString()}</td>`;
        });

        grandTotalGeneral += rowTotal;
        // El total en rojo suave o naranja para denotar "pendiente" sin ser agresivo
        html += `<td style="padding: 12px 16px; text-align: right; font-weight: 700; color: #ef4444;">${rowTotal.toLocaleString()}</td>`;
        html += `</tr>`;
    });

    // Fila de Totales Generales con fondo ligeramente distinto
    html += `
                <tr style="background: var(--surface-hover-color); font-weight: 700; border-top: 2px solid var(--border-color);">
                    <td style="padding: 14px 16px; color: var(--text-primary);">TOTAL PERIODO</td>
                    ${fiberColumns.map(f => `<td style="padding: 14px; text-align: center; color: var(--text-primary);">${colTotals[f].toLocaleString()}</td>`).join('')}
                    <td style="padding: 14px 16px; text-align: right; font-size: 1.1em; color: #ef4444;">${grandTotalGeneral.toLocaleString()}</td>
                </tr>
            </tbody>
        </table>
    </div>
    
    <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
        <button class="btn btn-glass" onclick="exportPivotToImage()" style="display: flex; align-items: center; gap: 8px; padding: 8px 16px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar Imagen
        </button>
    </div>
    `;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = html;
}

// 4. Exportar (Opcional, reutiliza html2canvas si ya lo tienes)
window.exportPivotToImage = function() {
    const tableDiv = document.querySelector('.pivot-table').parentElement;
    // Lógica simple de exportación usando tu librería existente
    if(typeof html2canvas !== 'undefined') {
        const theme = document.body.classList.contains('dark-theme') ? '#1f2937' : '#ffffff';
        html2canvas(tableDiv, { backgroundColor: theme }).then(canvas => {
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/jpeg');
            a.download = 'Proyeccion_Terminaciones.jpg';
            a.click();
        });
    } else {
        alert("Librería de imagen no cargada.");
    }
};


// =================================================================
// --- OPTIMIZACIÓN 2: GESTIÓN DE ÁREAS CON CACHÉ (EL FIX DEFINITIVO) ---
// =================================================================

// 1. Función Maestra para descargar áreas UNA SOLA VEZ
async function getCachedAreas() {
    if (globalAreasCache) return globalAreasCache; // ¡Si ya las tenemos, son gratis!

    try {
        const snapshot = await db.collection('areas').get();
        const areas = [];
        snapshot.forEach(doc => {
            if (doc.id !== 'CONFIG') areas.push(doc.id);
        });
        areas.sort();
        globalAreasCache = areas; // Guardamos en memoria para siempre
        console.log("✅ Áreas descargadas y guardadas en caché.");
        return areas;
    } catch (e) {
        console.error("Error cargando áreas:", e);
        return [];
    }
}

// 2. Helper Genérico para llenar cualquier Select
async function populateAreaSelect(selectId, includeAllOption = false) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Si ya tiene opciones (más de la default), no hacemos nada -> ¡Ahorro!
    if (select.options.length > 2) return; 

    const currentVal = select.value;
    // Ponemos "Cargando..." solo si está vacío
    if(select.options.length <= 1) select.innerHTML = '<option value="" disabled selected>Cargando...</option>';
    
    const areas = await getCachedAreas();
    
    let html = '<option value="" disabled selected>Seleccione Área</option>';
    if (includeAllOption) html += '<option value="ALL">Todas las Áreas</option>';
    
    areas.forEach(area => {
        html += `<option value="${area}">${area}</option>`;
    });
    
    select.innerHTML = html;
    
    // Restaurar selección o poner default
    if (areas.includes('MULTIPORT') && !currentVal) select.value = 'MULTIPORT';
    else if (currentVal) select.value = currentVal;
}

// 3. --- REEMPLAZO DE TUS FUNCIONES VIEJAS ---
// Al pegar esto, tu código automáticamente usará la versión optimizada
// sin que tengas que buscar dónde se llamaban los botones.

async function loadAreasForProductionReport() {
    // Reemplaza la lógica vieja del reporte por hora
    await populateAreaSelect('prod_area', false); 
}

async function loadAreasForTarimasReport() {
    // Reemplaza la lógica vieja del reporte de tarimas
    await populateAreaSelect('prodTarimas_area', true); 
}

async function loadAreasForOrdenesDia() {
    // Reemplaza la lógica vieja del reporte de órdenes del día
    await populateAreaSelect('ordenesDia_area', false); 
}

        // --- INICIO: INICIALIZACIÓN DE LA APP ---
        function initializeApp() {
    if (sessionStorage.getItem('reportesMasterSession') === 'true') session.isMaster = true;
    Promise.all([
        loadParams('901_config'),
        loadParams('terminaciones_config'),
        loadParams('produccion_hora_config'),
        loadParams('terminaciones_areas_config')
    ]).then(() => {
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 6);

        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        doc('prod_fecha_unica').value = formatDate(today);
        doc('prod_fecha_inicio').value = formatDate(pastDate);
        doc('prod_fecha_fin').value = formatDate(today);
        
        const currentShift = getAutoCurrentShift();
        doc('prod_turno').value = currentShift;
        

        applyTheme(currentTheme);
        Object.values(views).forEach(v => { v.style.display = 'none'; v.style.opacity = '0'; });
        views.menu.style.display = 'flex'; views.menu.style.opacity = '1';
    });
}

initializeApp();
    });
