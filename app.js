document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const fileStatus = document.getElementById('fileStatus');
    const logsList = document.getElementById('logsList');

    // Initialize Map
    const map = new MapRenderer('map');
    window.map = map.map; // Expose Leaflet instance globally for inline onclicks
    window.mapRenderer = map; // Expose Renderer helper for debugging/verification

    // Map Drop Zone Logic
    const mapContainer = document.getElementById('map');
    mapContainer.addEventListener('dragover', (e) => {
        e.preventDefault(); // Allow Drop
        mapContainer.style.boxShadow = 'inset 0 0 20px rgba(59, 130, 246, 0.5)';
    });

    mapContainer.addEventListener('dragleave', (e) => {
        mapContainer.style.boxShadow = 'none';
    });

    mapContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        mapContainer.style.boxShadow = 'none';

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data && data.logId && data.param) {
                // Determine Log and Points
                const log = loadedLogs.find(l => l.id === data.logId);
                if (log) {
                    console.log('Dropped on Map:', data);
                    // Update Map Layer
                    map.updateLayerMetric(log.id, log.points, data.param);
                    // Optional: Show some feedback?
                }
            }
        } catch (err) {
            console.error('Drop Error:', err);
        }
    });

    // Chart Drop Zone Logic (Docked & Modal)
    const handleChartDrop = (e) => {
        e.preventDefault();
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.border = 'none';

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data && data.logId && data.param) {
                const log = loadedLogs.find(l => l.id === data.logId);
                if (log) {
                    console.log('Dropped on Chart:', data);
                    window.openChartModal(log, data.param);
                }
            }
        } catch (err) {
            console.error('Chart Drop Error:', err);
        }
    };

    const handleChartDragOver = (e) => {
        e.preventDefault();
        e.currentTarget.style.boxShadow = 'inset 0 0 20px rgba(59, 130, 246, 0.5)';
        e.currentTarget.style.border = '2px dashed #3b82f6';
    };

    const handleChartDragLeave = (e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.border = 'none';
    };

    const dockedChartZone = document.getElementById('dockedChart');
    if (dockedChartZone) {
        dockedChartZone.addEventListener('dragover', handleChartDragOver);
        dockedChartZone.addEventListener('dragleave', handleChartDragLeave);
        dockedChartZone.addEventListener('drop', handleChartDrop);
    }

    const chartModal = document.getElementById('chartModal'); // or .modal-content?
    if (chartModal) {
        // Target the content specifically to avoid drop on backdrop
        const content = chartModal.querySelector('.modal-content');
        if (content) {
            content.addEventListener('dragover', handleChartDragOver);
            content.addEventListener('dragleave', handleChartDragLeave);
            content.addEventListener('drop', handleChartDrop);
        }
    }

    const loadedLogs = [];
    let currentSignalingLogId = null;


    function openChartModal(log, param) {
        // Store for Docking/Sync
        window.currentChartLogId = log.id;
        window.currentChartParam = param;

        let activeIndex = 0; // Track selected point index

        let container;
        let isDocked = isChartDocked;

        if (isDocked) {
            container = document.getElementById('dockedChart');
            container.innerHTML = ''; // Clear previous
        } else {
            let modal = document.getElementById('chartModal');
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = 'chartModal';
            // Initial size and position, with resize enabled
            modal.style.cssText = 'position:fixed; top:10%; left:10%; width:80%; height:70%; background:#1e1e1e; border:1px solid #444; z-index:2000; display:flex; flex-direction:column; box-shadow:0 0 20px rgba(0,0,0,0.8); resize:both; overflow:hidden; min-width:400px; min-height:300px;';
            document.body.appendChild(modal);
            container = modal;
        }

        // Initialize Chart in container (Calling internal helper or global?)
        // The chart initialization logic was inside openChartModal in the duplicate block.
        // We need to make sure we actually render the chart here!
        // But wait, the previous "duplicate" block actually contained the logic to RENDER the chart.
        // If I just close the function here, the chart won't render?
        // Let's check where the chart rendering logic is. 
        // It follows immediately in the old code.
        // I need to keep the chart rendering logic INSIDE openChartModal.
        // But the GRID logic must be OUTSIDE.

        // I will assume the Chart Logic continues after this replacement chunk. 
        // I will NOT close the function here yet. I need to find where the Chart Logic ENDS.

        // Wait, looking at Step 840/853...
        // The Grid System block starts at line 119.
        // The Chart Logic (preparing datasets) starts at line 410!
        // So the Grid Logic was INTERJECTED in the middle of openChartModal!
        // This is messy.

        // I should:
        // 1. Leave openChartModal alone for now (it's huge).
        // 2. Extract the Grid Logic OUT of it.
        // 3. But the Grid Logic is physically located between lines 119 and 400.
        // 4. And the Chart Logic resumes at 410?

        // Let's verify line 410.
        // Step 853 shows line 410: const labels = []; ...
        // YES.

        // So I need to MOVE lines 118-408 OUT of openChartModal.
        // But `openChartModal` starts at line 95.
        // Does the Chart Logic use variables from top of `openChartModal`?
        // `isDocked`, `container`, `log`, `param`.
        // Yes.

        // 1. Setup Container.
        // 2. [GRID LOGIC - WRONG PLACE]
        // 3. Prepare Data.
        // 4. Render Chart.

        // Grid Logic Moved to Global Scope

        // Prepare Data
        const labels = [];
        // Datasets arrays
        const dsServing = [];
        const dsA2 = [];
        const dsA3 = [];
        const dsN1 = [];
        const dsN2 = [];
        const dsN3 = [];

        const isComposite = (param === 'rscp_not_combined');

        // Original dataPoints for non-composite case
        const dataPoints = [];

        log.points.forEach((p, i) => {
            // ... parsing logic same as before ... 
            // Base Value (Serving)
            let val = p[param];
            if (param === 'rscp_not_combined') val = p.level !== undefined ? p.level : (p.rscp !== undefined ? p.rscp : -999);
            else if (param.startsWith('active_set_')) {
                const sub = param.replace('active_set_', '');
                const lowerSub = sub.toLowerCase();
                val = p[lowerSub];
            } else {
                if (param === 'band' && p.parsed) val = p.parsed.serving.band;
                if (val === undefined && p.parsed && p.parsed.serving[param] !== undefined) val = p.parsed.serving[param];
            }

            // Always add point to prevent index mismatch (Chart Index must equal Log Index)
            const label = p.time || `Pt ${i}`;
            labels.push(label);
            dsServing.push(parseFloat(val));

            if (isComposite) {
                dsA2.push(p.a2_rscp !== undefined ? parseFloat(p.a2_rscp) : null);
                dsA3.push(p.a3_rscp !== undefined ? parseFloat(p.a3_rscp) : null);
                dsN1.push(p.n1_rscp !== undefined ? parseFloat(p.n1_rscp) : null);
                dsN2.push(p.n2_rscp !== undefined ? parseFloat(p.n2_rscp) : null);
                dsN3.push(p.n3_rscp !== undefined ? parseFloat(p.n3_rscp) : null);
            } else {
                dataPoints.push(parseFloat(val));
            }
        });

        // Default Settings
        const chartSettings = {
            type: 'line', // 'line' or 'bar'
            servingColor: '#3b82f6', // BLUE for Serving (A1)
            useGradient: false, // Turn off neon gradient
            a2Color: '#3b82f6', // BLUE
            a3Color: '#3b82f6', // BLUE
            n1Color: '#22c55e', // GREEN
            n2Color: '#22c55e', // GREEN
            n3Color: '#22c55e', // GREEN
            servingWidth: 4,
            n1Width: 2,
            n2Width: 2,
            n3Width: 2
        };

        const controlsId = 'chartControls_' + Date.now();
        const headerId = 'chartHeader_' + Date.now();

        // Header Buttons
        const dockBtn = isDocked
            ? `<button onclick="window.undockChart()" style="background:#555; color:white; border:none; padding:5px 10px; cursor:pointer; font-size:11px;">Undock</button>`
            : `<button onclick="window.dockChart()" style="background:#3b82f6; color:white; border:none; padding:5px 10px; cursor:pointer; font-size:11px;">Dock</button>`;

        const closeBtn = isDocked
            ? ''
            : `<button onclick="window.currentChartInstance=null;window.currentChartLogId=null;document.getElementById('chartModal').remove()" style="background:#ef4444; color:white; border:none; padding:5px 10px; cursor:pointer; pointer-events:auto;">Close</button>`;

        const dragCursor = isDocked ? 'default' : 'move';

        container.innerHTML = `
                    <div id="${headerId}" style="padding:10px; background:#2d2d2d; border-bottom:1px solid #444; display:flex; justify-content:space-between; align-items:center; cursor:${dragCursor}; user-select:none;">
                        <div style="display:flex; align-items:center; pointer-events:none;">
                            <h3 style="margin:0; margin-right:20px; pointer-events:auto; font-size:14px;">${log.name} - ${isComposite ? 'RSCP & Neighbors' : param.toUpperCase()}</h3>
                            
                            <div style="display:flex; gap:5px; align-items:center; margin-right:20px; pointer-events:auto;">
                                 <button id="zoomInBtn" title="Zoom In" style="background:#333; color:white; border:1px solid #555; padding:5px 10px; cursor:pointer;">+</button>
                                 <button id="zoomOutBtn" title="Zoom Out" style="background:#333; color:white; border:1px solid #555; padding:5px 10px; cursor:pointer;">-</button>
                                 <button id="resetZoomBtn" title="Reset Zoom" style="background:#333; color:white; border:1px solid #555; padding:5px 10px; cursor:pointer;">Reset</button>
                            </div>

                            <button id="styleToggleBtn" style="background:#333; color:#ccc; border:1px solid #555; padding:5px 10px; cursor:pointer; pointer-events:auto; font-size:11px;">⚙️ Style</button>
                        </div>
                        <div style="pointer-events:auto; display:flex; gap:10px;">
                            ${dockBtn}
                            ${closeBtn}
                        </div>
                    </div>
                    
                    <!-- Settings Panel -->
                    <div id="${controlsId}" style="display:none; background:#252525; padding:10px; border-bottom:1px solid #444; gap:15px; align-items:center; flex-wrap:wrap;">
                         <!-- General Settings -->
                        <div style="display:flex; flex-direction:column; gap:2px; border-right:1px solid #444; padding-right:10px;">
                             <label style="color:#aaa; font-size:10px; font-weight:bold;">Type</label>
                             <select id="chartTypeSelect" style="background:#333; color:white; border:1px solid #555; font-size:11px;">
                                 <option value="line">Line (Timeline)</option>
                                 <option value="bar">Bar (Snapshot)</option>
                             </select>
                        </div>
                        <!-- Serving Controls -->
                        <div style="display:flex; flex-direction:column; gap:2px; border-right:1px solid #444; padding-right:10px;">
                            <label style="color:#aaa; font-size:10px; font-weight:bold;">Serving</label>
                            <div style="display:flex; gap:5px; align-items:center;">
                                <input type="color" id="pickerServing" value="#3b82f6" style="border:none; width:30px; height:20px; cursor:pointer;">
                                <label style="color:#ccc; font-size:11px;"><input type="checkbox" id="checkGradient"> Grad</label>
                            </div>
                            <div style="display:flex; gap:5px; align-items:center;">
                                 <label style="color:#aaa; font-size:10px;">Width</label>
                                 <input type="range" id="rangeServingWidth" min="1" max="10" value="4" style="width:60px;">
                            </div>
                        </div>

                        ${isComposite ? `
                        <div style="display:flex; flex-direction:column; gap:2px; padding-right:5px;">
                            <label style="color:#aaa; font-size:10px;">N1 Style</label>
                            <input type="color" id="pickerN1" value="#22c55e" style="border:none; width:30px; height:20px; cursor:pointer;">
                            <input type="range" id="rangeN1Width" min="1" max="8" value="2" style="width:50px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:2px; padding-right:5px;">
                            <label style="color:#aaa; font-size:10px;">N2 Style</label>
                            <input type="color" id="pickerN2" value="#22c55e" style="border:none; width:30px; height:20px; cursor:pointer;">
                            <input type="range" id="rangeN2Width" min="1" max="8" value="2" style="width:50px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <label style="color:#aaa; font-size:10px;">N3 Style</label>
                            <input type="color" id="pickerN3" value="#22c55e" style="border:none; width:30px; height:20px; cursor:pointer;">
                            <input type="range" id="rangeN3Width" min="1" max="8" value="2" style="width:50px;">
                        </div>
                        ` : ''}
                    </div>

                    <div style="flex:1; padding:10px; display:flex; gap:10px; height: 100%; min-height: 0;">
                        <!-- Line Chart Section (50%) -->
                        <div id="lineChartContainer" style="flex:1; position:relative; min-width:0;">
                            <canvas id="lineChartCanvas"></canvas>
                        </div>
                        
                        <!-- Bar Chart Section (50%) -->
                        <div id="barChartContainer" style="flex:1; position:relative; min-width:0; border-left:1px solid #444; padding-left:10px;">
                            <canvas id="barChartCanvas"></canvas>
                             <div id="barOverlayInfo" style="position:absolute; top:10px; right:10px; color:white; background:rgba(0,0,0,0.7); padding:2px 5px; border-radius:4px; font-size:10px; pointer-events:none;">
                                Snapshot
                            </div>
                        </div>
                    </div>
                    <!-- Resize handle visual cue (bottom right) -->
                    <div style="position:absolute; bottom:2px; right:2px; width:10px; height:10px; cursor:nwse-resize;"></div>
                `;

        // Settings Toggle Logic
        document.getElementById('styleToggleBtn').onclick = () => {
            const panel = document.getElementById(controlsId);
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        };

        // DRAG LOGIC (Only if not docked)
        if (!isDocked) {
            const header = document.getElementById(headerId);
            let isDragging = false;
            let dragStartX, dragStartY;
            let diffX, diffY; // Difference between mouse and modal top-left

            header.addEventListener('mousedown', (e) => {
                // Only drag if left click and target is not a button/input (handled by pointer-events in HTML structure but good to be safe)
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

                isDragging = true;

                // Calculate offset of mouse from modal top-left
                const rect = container.getBoundingClientRect();
                diffX = e.clientX - rect.left;
                diffY = e.clientY - rect.top;

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            function onMouseMove(e) {
                if (!isDragging) return;

                let newLeft = e.clientX - diffX;
                let newTop = e.clientY - diffY;

                container.style.left = newLeft + 'px';
                container.style.top = newTop + 'px';
            }

            function onMouseUp() {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
        }

        const lineCtx = document.getElementById('lineChartCanvas').getContext('2d');
        const barCtx = document.getElementById('barChartCanvas').getContext('2d');

        // Define Gradient Creator (Use Line Context)
        const createGradient = (color1, color2) => {
            const g = lineCtx.createLinearGradient(0, 0, 0, 400);
            g.addColorStop(0, color1);
            g.addColorStop(1, color2);
            return g;
        };



        // Vertical Line Plugin with Badge Style (Pill)
        const verticalLinePlugin = {
            id: 'verticalLine',
            afterDraw: (chart) => {
                if (chart.config.type === 'line' && activeIndex !== null) {
                    // console.log('Drawing Vertical Line for Index:', activeIndex);
                    const meta = chart.getDatasetMeta(0);
                    if (!meta.data[activeIndex]) return;
                    const point = meta.data[activeIndex];
                    const ctx = chart.ctx;

                    if (point && !point.skip) {
                        const x = point.x;
                        const topY = chart.scales.y.top;
                        const bottomY = chart.scales.y.bottom;
                        const y = point.y; // Point Value Y position

                        ctx.save();

                        // 1. Draw Vertical Line (Subtle)
                        ctx.beginPath();
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                        ctx.lineWidth = 1;
                        ctx.moveTo(x, topY);
                        ctx.lineTo(x, bottomY);
                        ctx.stroke();

                        // 2. Draw Glow Dot on Point
                        ctx.shadowColor = '#ff00cc';
                        ctx.shadowBlur = 10;
                        ctx.beginPath();
                        ctx.fillStyle = '#ff00cc';
                        ctx.arc(x, y, 4, 0, Math.PI * 2);
                        ctx.fill();

                        // Reset Shadow for Badge
                        ctx.shadowBlur = 0;

                        // 3. Draw Badge (Pill) ABOVE the point
                        const measure = chart.data.datasets[0].data[activeIndex];
                        const text = typeof measure === 'number' ? measure.toFixed(1) : measure;

                        ctx.font = 'bold 12px sans-serif';
                        const textWidth = ctx.measureText(text).width;
                        const paddingX = 10;
                        const paddingY = 4;
                        const badgeWidth = textWidth + paddingX * 2;
                        const badgeHeight = 22;
                        const badgeX = x - badgeWidth / 2;
                        const badgeY = y - 35; // Position 35px above point

                        // Draw Pill Background
                        ctx.beginPath();
                        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 10);
                        ctx.fillStyle = '#ff00cc';
                        ctx.fill();

                        // Draw small triangle arrow pointing down
                        ctx.beginPath();
                        ctx.moveTo(x, badgeY + badgeHeight);
                        ctx.lineTo(x - 4, badgeY + badgeHeight + 4);
                        ctx.lineTo(x + 4, badgeY + badgeHeight + 4);
                        ctx.fill();

                        // Draw Text
                        ctx.fillStyle = 'white';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(text, x, badgeY + badgeHeight / 2);

                        ctx.restore();

                        // Store Badge Rect for Hit Testing
                        chart.lastBadgeRect = {
                            x: badgeX,
                            y: badgeY,
                            w: badgeWidth,
                            h: badgeHeight
                        };
                    }
                } else {
                    chart.lastBadgeRect = null;
                }
            }
        };

        // Custom Plugin for Line Glow
        const glowPlugin = {
            id: 'glowEffect',
            beforeDatasetDraw: (chart, args) => {
                const ctx = chart.ctx;
                if (chart.config.type === 'line' && args.index === 0) {
                    ctx.save();
                    ctx.shadowColor = chartSettings.servingColor;
                    ctx.shadowBlur = 15;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                }
            },
            afterDatasetDraw: (chart, args) => {
                const ctx = chart.ctx;
                if (chart.config.type === 'line' && args.index === 0) {
                    ctx.restore();
                }
            }
        };

        // Construct Data Logic
        const getChartConfigData = (overrideMode) => {
            const currentType = overrideMode || chartSettings.type;
            const isBar = currentType === 'bar';
            // Scale Floor for Bar Chart (dBm)
            const floor = -120;

            // ----------------------------------------------------
            // MODE: BAR (Snapshot) with Floating Bars (Pillars)
            // ----------------------------------------------------
            if (isBar) {
                // Ensure active index is valid
                if (activeIndex === null || activeIndex < 0) activeIndex = 0;
                if (activeIndex >= log.points.length) activeIndex = log.points.length - 1;

                const p = log.points[activeIndex];

                // Extract Values
                // Serving
                let valServing = p[param];
                if (param === 'rscp_not_combined') valServing = p.level !== undefined ? p.level : (p.rscp !== undefined ? p.rscp : -999);
                else {
                    if (param === 'band' && p.parsed) valServing = p.parsed.serving.band;
                    if (valServing === undefined && p.parsed && p.parsed.serving[param] !== undefined) valServing = p.parsed.serving[param];
                }

                // Helper to format float bar: [floor, val]
                const mkBar = (v) => (v !== undefined && v !== null && !isNaN(v)) ? [floor, parseFloat(v)] : null;

                if (isComposite) {
                    // Logic to find Unique Neighbors (Not in Active Set)
                    // Active Set SCs
                    const activeSCs = [p.sc, p.a2_sc, p.a3_sc].filter(sc => sc !== null && sc !== undefined);

                    let uniqueNeighbors = [];
                    if (p.parsed && p.parsed.neighbors) {
                        uniqueNeighbors = p.parsed.neighbors.filter(n => !activeSCs.includes(n.pci));
                    }

                    // Fallback to top 3 if logic fails or array empty, but ideally we use these
                    const n1 = uniqueNeighbors.length > 0 ? uniqueNeighbors[0] : null;
                    const n2 = uniqueNeighbors.length > 1 ? uniqueNeighbors[1] : null;
                    const n3 = uniqueNeighbors.length > 2 ? uniqueNeighbors[2] : null;

                    // Helper for SC Label
                    const lbl = (prefix, sc) => sc !== undefined && sc !== null ? `${prefix} (${sc})` : prefix;

                    return {
                        labels: [
                            lbl('A1', p.sc),
                            lbl('A2', p.a2_sc),
                            lbl('A3', p.a3_sc),
                            lbl('N1', n1 ? n1.pci : null),
                            lbl('N2', n2 ? n2.pci : null),
                            lbl('N3', n3 ? n3.pci : null)
                        ],
                        datasets: [{
                            label: 'Signal Strength',
                            data: [
                                mkBar(valServing),
                                mkBar(p.a2_rscp),
                                mkBar(p.a3_rscp),
                                mkBar(n1 ? n1.rscp : null),
                                mkBar(n2 ? n2.rscp : null),
                                mkBar(n3 ? n3.rscp : null)
                            ],
                            backgroundColor: [
                                chartSettings.servingColor,
                                chartSettings.a2Color,
                                chartSettings.a3Color,
                                chartSettings.n1Color,
                                chartSettings.n2Color,
                                chartSettings.n3Color
                            ],
                            borderColor: '#fff',
                            borderWidth: 1,
                            borderRadius: 4
                        }]
                    };
                } else {
                    // Single metric for Serving only? Or compare something else?
                    // If standard metric, maybe just show it
                    return {
                        labels: ['Serving'],
                        datasets: [{
                            label: param.toUpperCase(),
                            data: [mkBar(valServing)],
                            backgroundColor: [chartSettings.servingColor],
                            borderColor: '#fff',
                            borderWidth: 1,
                            borderRadius: 4
                        }]
                    };
                }
            }

            // ----------------------------------------------------
            // MODE: LINE (Time Series) - NEON STYLE
            // ----------------------------------------------------
            else {
                const datasets = [];

                // Gradient Stroke for Main Line
                // Use a horizontal gradient (magento to blue)
                let gradientStroke = chartSettings.servingColor;
                if (chartSettings.useGradient) {
                    const width = lineCtx.canvas.width;
                    const gradient = lineCtx.createLinearGradient(0, 0, width, 0);
                    gradient.addColorStop(0, '#ff00cc'); // Magenta
                    gradient.addColorStop(0.5, '#a855f7'); // Purple
                    gradient.addColorStop(1, '#3b82f6'); // Blue
                    gradientStroke = gradient;
                }

                if (isComposite) {
                    // ... (keep existing composite logic)
                    datasets.push({
                        label: 'Serving RSCP (A1)',
                        data: dsServing,
                        borderColor: chartSettings.servingColor, // BLUE
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        tension: 0.2,
                        fill: true
                    });

                    datasets.push({
                        label: 'A2 RSCP',
                        data: dsA2,
                        borderColor: chartSettings.a2Color,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.2,
                        fill: false
                    });

                    datasets.push({
                        label: 'A3 RSCP',
                        data: dsA3,
                        borderColor: chartSettings.a3Color,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.2,
                        fill: false
                    });

                    // Neighbors (All Green)
                    datasets.push({
                        label: 'N1 RSCP',
                        data: dsN1,
                        borderColor: chartSettings.n1Color,
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.2,
                        fill: false
                    });
                    datasets.push({
                        label: 'N2 RSCP',
                        data: dsN2,
                        borderColor: chartSettings.n2Color,
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.2,
                        fill: false
                    });
                    datasets.push({
                        label: 'N3 RSCP',
                        data: dsN3,
                        borderColor: chartSettings.n3Color,
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.2,
                        fill: false
                    });
                } else if (param === 'active_set') {
                    // Active Set Mode (6 Lines, Dual Axis)

                    // A1 (Serving)
                    datasets.push({
                        label: 'A1 RSCP',
                        data: dsServing,
                        borderColor: chartSettings.servingColor, // Blue-ish default
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.2,
                        yAxisID: 'y'
                    });
                    datasets.push({
                        label: 'A1 SC',
                        data: log.points.map(p => p.sc !== undefined ? p.sc : (p.parsed && p.parsed.serving ? p.parsed.serving.sc : null)),
                        borderColor: chartSettings.servingColor,
                        borderDash: [5, 5],
                        borderWidth: 1,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0, // Stepped
                        yAxisID: 'y1'
                    });

                    // A2 (Neighborhood 1)
                    datasets.push({
                        label: 'A2 RSCP',
                        data: dsN1, // mapped from n1_rscp
                        borderColor: chartSettings.n1Color,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.2,
                        yAxisID: 'y'
                    });
                    datasets.push({
                        label: 'A2 SC',
                        data: log.points.map(p => p.n1_sc !== undefined ? p.n1_sc : (p.parsed && p.parsed.neighbors && p.parsed.neighbors[0] ? p.parsed.neighbors[0].pci : null)),
                        borderColor: chartSettings.n1Color,
                        borderDash: [5, 5],
                        borderWidth: 1,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0,
                        yAxisID: 'y1'
                    });

                    // A3 (Neighborhood 2)
                    datasets.push({
                        label: 'A3 RSCP',
                        data: dsN2, // mapped from n2_rscp
                        borderColor: chartSettings.n2Color,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.2,
                        yAxisID: 'y'
                    });
                    datasets.push({
                        label: 'A3 SC',
                        data: log.points.map(p => p.n2_sc !== undefined ? p.n2_sc : (p.parsed && p.parsed.neighbors && p.parsed.neighbors[1] ? p.parsed.neighbors[1].pci : null)),
                        borderColor: chartSettings.n2Color,
                        borderDash: [5, 5],
                        borderWidth: 1,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0,
                        yAxisID: 'y1'
                    });

                } else {
                    datasets.push({
                        label: param.toUpperCase(),
                        data: dataPoints,
                        borderColor: gradientStroke,
                        backgroundColor: 'rgba(51, 51, 255, 0.02)',
                        borderWidth: 3,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        tension: 0.4,
                        fill: true
                    });
                }

                return {
                    labels: labels, // Global time labels
                    datasets: datasets
                };
            }
        };

        // Custom Plugin for Bar Labels (Level, SC, Band)
        const barLabelsPlugin = {
            id: 'barLabels',
            afterDraw: (chart) => {
                if (chart.config.type === 'bar') {
                    const ctx = chart.ctx;
                    // Only Dataset 0 usually
                    const meta = chart.getDatasetMeta(0);
                    if (!meta.data || meta.data.length === 0) return;

                    // Get Current Point Data
                    if (activeIndex === null || activeIndex < 0) return; // Should allow default
                    // Actually activeIndex matches the selected point in Log.
                    // The chart data itself is ALREADY the snapshot of that point.

                    // We need to retrieve the SC/Band info.
                    // The Chart Data only has numbers (RSCP).
                    // We need to access the source 'log' point.

                    // Accessing the outer 'log' variable from closure.
                    const p = log.points[activeIndex];
                    if (!p) return;

                    meta.data.forEach((bar, index) => {
                        if (!bar || bar.hidden) return;

                        // Determine Content based on Index
                        const val = chart.data.datasets[0].data[index];
                        const levelVal = Array.isArray(val) ? val[1] : val;

                        if (levelVal === null || levelVal === undefined) return;

                        let textLines = [];
                        textLines.push(`${levelVal.toFixed(1)}`); // Level

                        if (index === 0) {
                            // Serving
                            const sc = p.sc ?? (p.parsed && p.parsed.serving ? p.parsed.serving.sc : '-');
                            const band = p.parsed && p.parsed.serving ? p.parsed.serving.band : '-';
                            if (sc !== undefined) textLines.push(`SC: ${sc}`);
                            if (band) textLines.push(band);
                        } else {
                            // For others (A2, A3, N1...), use the SC included in the Axis Label
                            // Label format: "Name (SC)" e.g. "N1 (120)"
                            const axisLabel = chart.data.labels[index];
                            const match = /\((\d+)\)/.exec(axisLabel);
                            if (match) {
                                textLines.push(`SC: ${match[1]}`);
                            } else {
                                // Fallback if no SC in label (e.g. empty or legacy)
                            }
                        }

                        // Draw Text
                        const x = bar.x;
                        const y = bar.base; // Bottom of the bar

                        ctx.save();
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom'; // Draw from bottom up
                        ctx.font = 'bold 11px sans-serif';

                        // Draw each line moving up from bottom
                        let curY = y - 5;

                        // Iterate normal order: Level first (at bottom)
                        // If we want Level at the very bottom, we draw it first at curY.
                        // Then move curY up for next lines.
                        textLines.forEach((line, i) => {
                            if (i === 0) { // The Level Value (first)
                                ctx.fillStyle = '#fff';
                                ctx.font = 'bold 12px sans-serif';
                            } else {
                                ctx.fillStyle = 'rgba(255,255,255,0.8)'; // Lighter white
                                ctx.font = '10px sans-serif';
                            }
                            ctx.fillText(line, x, curY);
                            curY -= 12; // Line height moving up
                        });

                        ctx.restore();
                    });
                }
            }
        };

        // Use 'let' to allow reassignment later
        // Initialize Contexts (Already done above)

        // Common Option Factory
        const getCommonOptions = (isLine) => {
            return {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 40 } },
                onClick: (e) => {
                    // Only Line Chart drives selection
                    if (isLine) {
                        const points = lineChartInstance.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
                        if (points.length) {
                            activeIndex = points[0].index;
                            // Use Central Update to trigger Global Sync
                            if (window.updateDualCharts) {
                                window.updateDualCharts(activeIndex);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#666', maxTicksLimit: 10 },
                        grid: { color: 'rgba(255,255,255,0.05)', display: false }
                    },
                    y: {
                        ticks: { color: '#666' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                },
                plugins: {
                    legend: { display: isComposite, labels: { color: '#ccc' } },
                    tooltip: {
                        enabled: false,
                        mode: 'index',
                        intersect: false
                    },
                    zoom: isLine ? {
                        zoom: {
                            wheel: { enabled: true, modifierKey: 'ctrl' },
                            pinch: { enabled: true },
                            mode: 'x'
                        },
                        pan: { enabled: true, mode: 'x' }
                    } : false
                }
            };
        };

        // Instantiate Line Chart
        let lineChartInstance = new Chart(lineCtx, {
            type: 'line',
            data: getChartConfigData('line'),
            options: getCommonOptions(true),
            plugins: [verticalLinePlugin, glowPlugin]
        });

        // Instantiate Bar Chart
        let barChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: getChartConfigData('bar'),
            options: getCommonOptions(false),
            plugins: [barLabelsPlugin] // Only Bar gets labels
        });

        // ----------------------------------------------------
        // Drag / Scrubbing Logic for Line Chart
        // ----------------------------------------------------
        // ----------------------------------------------------
        // Drag / Scrubbing Logic for Line Chart
        // ----------------------------------------------------
        let isScrubbing = false;
        const lineCanvas = document.getElementById('lineChartCanvas');



        // Helper to check if mouse is over badge
        const isOverBadge = (e) => {
            if (!lineChartInstance.lastBadgeRect) return false;
            const rect = lineCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const b = lineChartInstance.lastBadgeRect;
            return (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
        };

        const handleScrub = (e) => {
            const points = lineChartInstance.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
            if (points.length) {
                const idx = points[0].index;
                if (idx !== activeIndex) {
                    window.updateDualCharts(idx);
                }
            }
        };

        // Explicit Click Listener for robust syncing (MOVED HERE TO AVOID REFERENCE ERROR)
        lineCanvas.onclick = (e) => {
            // If we were just scrubbing/dragging, ignore click to prevent jitters?
            // Actually, scrubbing updates continuously. A final click update is harmless.
            // Crucially, this catches clicks on the line that Chart.js 'onClick' sometimes misses.
            handleScrub(e);

            // NEW: Auto-Zoom to Window of 10 on Click
            // Only auto-zoom if we have a valid selection
            if (activeIndex !== null && lineChartInstance) {
                zoomToActiveWindow();
            }
        };

        lineCanvas.addEventListener('mousedown', (e) => {
            // Check if clicking on the badge
            // User requested "select the label... and drag"
            // We differentiate: Drag Badge = Scrub. Drag Background = Pan (if zoomed).

            if (isOverBadge(e)) {
                isScrubbing = true;
                lineCanvas.style.cursor = 'grabbing';
                handleScrub(e);
                // CRITICAL: Stop propagation to prevent Chart.js Pan plugin from handling this
                e.stopPropagation();
                // e.preventDefault(); // Optional, but stopPropagation is key here
            } else {
                // Allow default behavior (Pan)
            }
        }, true); // Use Capture phase to intercept before Chart.js plugin

        lineCanvas.addEventListener('mousemove', (e) => {
            if (isScrubbing) {
                handleScrub(e);
                lineCanvas.style.cursor = 'grabbing';
            } else {
                // Hover effect
                if (isOverBadge(e)) {
                    lineCanvas.style.cursor = 'grab';
                } else {
                    lineCanvas.style.cursor = 'default';
                }
            }
        });

        window.addEventListener('mouseup', () => {
            if (isScrubbing) {
                isScrubbing = false;
                lineCanvas.style.cursor = 'default'; // Or check hover again?
            }
        });

        const updateBarOverlay = () => {
            const overlay = document.getElementById('barOverlayInfo');
            if (overlay) {
                overlay.textContent = (log.points[activeIndex] ? log.points[activeIndex].time : 'N/A');
            }
        };

        // Store globally for Sync
        window.currentChartLogId = log.id;
        window.currentChartInstance = lineChartInstance; // Primary for some checks? Or maybe expose both?
        // Let's expose specific update function
        window.updateDualCharts = (idx, skipGlobalSync = false) => {
            activeIndex = idx;
            lineChartInstance.draw();
            barChartInstance.data = getChartConfigData('bar');
            barChartInstance.update();
            updateBarOverlay();

            // Trigger Global Sync if this update came from the Chart itself (Scrub/Click)
            // If skipGlobalSync is true, it means globalSync called us, so don't loop back.
            if (!skipGlobalSync && log.points[idx]) {
                // Differentiate between Scrub and Click? 
                // We'll treat this as 'chart' source. 
                // If dragging, maybe use 'chart_scrub' to avoid pan?
                // For now, let's use 'chart_scrub' if isScrubbing is true.
                // We need to access isScrubbing variable. It's in this closure.
                const source = isScrubbing ? 'chart_scrub' : 'chart';
                window.globalSync(window.currentChartLogId, idx, source);
            } else if (log.points[idx]) {
                // Even if triggered by sync, we still update floating panel? 
                // globalSync handles floating panel too.
            }
        };

        // Function to update Active Index from Map
        window.currentChartActiveIndexSet = (idx) => {
            window.updateDualCharts(idx);
        };

        // Global function to update the Floating Info Panel
        window.updateFloatingInfoPanel = (p) => {
            const panel = document.getElementById('floatingInfoPanel');
            const content = document.getElementById('infoPanelContent');
            if (!panel || !content) return;
            // FORCE LOG: using error to bypass potential filters
            // console.error("DEBUG: updateFloatingInfoPanel called for point:", p ? p.time : 'null');

            // Show panel if hidden
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
            }

            // --- Helper: Lookup Cell Name from SiteData ---
            const resolveCellName = (pci, cellId, lac, freq, lat, lng, rnc) => {
                const NO_MATCH = { name: null, id: null };

                // 0. Helper & Dist
                if (!window.mapRenderer || !window.mapRenderer.siteData) return NO_MATCH;
                const siteData = window.mapRenderer.siteData;

                const getName = (s) => s.cellName || s.name || s.siteName;
                const getDist = (s) => {
                    if (lat === undefined || lng === undefined || !s.lat || !s.lng) return 999999;
                    return Math.sqrt(Math.pow(s.lat - lat, 2) + Math.pow(s.lng - lng, 2));
                };

                // 1. Serving Cell Logic: STRICT CellID Match
                if (cellId !== undefined && cellId !== null) {
                    // A. Exact Match (Long ID)
                    let match = siteData.find(s => s.cellId == cellId);
                    // if (match) console.log(`[Resolution A] Exact Long ID Match: ${cellId} -> ${getName(match)}`);

                    // B. Fallback: Short CID + LAC Match
                    if (!match && lac) {
                        const shortCid = cellId & 0xFFFF;
                        match = siteData.find(s => s.cellId == shortCid && s.lac == lac);
                        // if (match) console.log(`[Resolution B] Short+LAC Match: ${shortCid}/${lac} -> ${getName(match)}`);
                    }

                    // C. Fallback: RNC/CID Format Match (User Request)
                    const shortCid = cellId & 0xFFFF;
                    const rncCidStr = `${rnc}/${shortCid}`;

                    if (!match && rnc !== undefined && rnc !== null) {
                        const norm = (val) => String(val).replace(/\s/g, '');
                        match = siteData.find(s => norm(s.cellId) == norm(rncCidStr));
                        // console.log(`[Resolution C] RNC/CID Check: ${rncCidStr}. Found=${match ? getName(match) : 'No'}. (DB Size: ${siteData.length})`);
                    }

                    if (match) return { name: getName(match), id: match.cellId, lat: match.lat, lng: match.lng };
                }

                // 2. Neighbor Logic: SC + Freq + Proximity
                if (pci !== undefined && pci !== null) {
                    let candidates = siteData.filter(s => s.pci == pci || s.sc == pci);
                    if (freq) {
                        const freqCandidates = candidates.filter(s => {
                            const sFreq = s.freq || s.dl_freq;
                            return Math.abs(parseFloat(sFreq) - parseFloat(freq)) < 5;
                        });
                        if (freqCandidates.length > 0) candidates = freqCandidates;
                    }
                    if (candidates.length > 0) {
                        candidates.sort((a, b) => getDist(a) - getDist(b));
                        return { name: getName(candidates[0]), id: candidates[0].cellId, lat: candidates[0].lat, lng: candidates[0].lng };
                    }
                }
                return NO_MATCH;
            };

            // --- DATA PREPARATION ---
            let connectionTargets = []; // Array to hold line targets {lat, lng, color}

            // 1. Serving Cell
            const sLac = p.lac || (p.parsed && p.parsed.serving ? p.parsed.serving.lac : null);
            const sFreq = p.freq || (p.parsed && p.parsed.serving ? p.parsed.serving.freq : null);

            let servingRes = resolveCellName(p.sc, p.cellId, sLac, sFreq, p.lat, p.lng, p.rnc);
            if (!servingRes.name && p.cellId) servingRes = resolveCellName(null, p.cellId, sLac, sFreq, p.lat, p.lng, p.rnc);
            // Add Serving Line (BLUE)
            if (servingRes.lat && servingRes.lng) {
                // Weight 8 (Super Bold), connecting to Tip (via cellId lookup)
                connectionTargets.push({
                    lat: servingRes.lat,
                    lng: servingRes.lng,
                    color: '#3b82f6',
                    weight: 8,
                    cellId: servingRes.id
                });
            }

            const servingData = {
                type: 'Serving',
                name: servingRes.name || 'Unknown',
                cellId: servingRes.id || p.cellId, // Fallback to log ID if no match
                sc: p.sc,
                rscp: p.rscp !== undefined ? p.rscp : (p.level !== undefined ? p.level : (p.parsed.serving.level || '-')),
                ecno: p.ecno !== undefined ? p.ecno : (p.parsed.serving.ecno || '-'),
                freq: sFreq || '-'
            };

            // 2. Active Set (A2, A3)
            let activeRows = [];
            // Parse Active Set string "SC1, SC2, SC3" or check properties
            // The parser already calculates a2_sc, a2_rscp, etc. if active_set string exists
            if (p.a2_sc !== undefined && p.a2_sc !== null) {
                // Resolve A2 Name (using sc + serving freq as guess, or neighbor lookup)
                const a2Res = resolveCellName(p.a2_sc, null, sLac, sFreq, p.lat, p.lng);
                // Find EcNo for A2 - typically in neighbors list
                const nA2 = p.parsed.neighbors ? p.parsed.neighbors.find(n => n.pci === p.a2_sc) : null;

                // Add A2 Line (RED)
                if (a2Res.lat && a2Res.lng) {
                    connectionTargets.push({
                        lat: a2Res.lat,
                        lng: a2Res.lng,
                        color: '#ef4444',
                        weight: 8,
                        cellId: a2Res.id
                    });
                }

                activeRows.push({
                    type: '2nd Active Set',
                    name: a2Res.name || 'Unknown',
                    cellId: a2Res.id,
                    sc: p.a2_sc,
                    rscp: p.a2_rscp || (nA2 ? nA2.rscp : '-'),
                    ecno: nA2 ? nA2.ecno : '-',
                    freq: sFreq || '-' // Intra-freq assumption for AS
                });
            }
            if (p.a3_sc !== undefined && p.a3_sc !== null) {
                const a3Res = resolveCellName(p.a3_sc, null, sLac, sFreq, p.lat, p.lng);
                const nA3 = p.parsed.neighbors ? p.parsed.neighbors.find(n => n.pci === p.a3_sc) : null;

                // Add A3 Line (RED)
                if (a3Res.lat && a3Res.lng) {
                    connectionTargets.push({
                        lat: a3Res.lat,
                        lng: a3Res.lng,
                        color: '#ef4444',
                        weight: 8,
                        cellId: a3Res.id
                    });
                }

                activeRows.push({
                    type: '3rd Active Set',
                    name: a3Res.name || 'Unknown',
                    cellId: a3Res.id,
                    sc: p.a3_sc,
                    rscp: p.a3_rscp || (nA3 ? nA3.rscp : '-'),
                    ecno: nA3 ? nA3.ecno : '-',
                    freq: sFreq || '-'
                });
            }

            // 3. Neighbors (N1, N2, N3)
            // We want Top 3 neighbors that are NOT in Active Set (usually N1 might be A2?)
            // But user request just says "N1, N2..." which implies the sorted neighbor list.
            // Let's just show top 3 neighbors            // 3. Neighbors (N1...N)
            let neighborRows = [];
            if (p.parsed && p.parsed.neighbors) {
                // Collect Active Set SCs to exclude them from Neighbor list
                const activeSCs = [p.sc];
                if (p.a2_sc !== undefined && p.a2_sc !== null) activeSCs.push(p.a2_sc);
                if (p.a3_sc !== undefined && p.a3_sc !== null) activeSCs.push(p.a3_sc);

                // Filter out ANY Active/Serving SC
                const neighbors = p.parsed.neighbors.filter(n => !activeSCs.includes(n.pci));

                // Show ALL remaining neighbors
                neighbors.forEach((n, idx) => {
                    const nRes = resolveCellName(n.pci, n.cellId, sLac, n.freq, p.lat, p.lng);

                    // Add Neighbor Line (GREEN)
                    if (nRes.lat && nRes.lng) {
                        connectionTargets.push({
                            lat: nRes.lat,
                            lng: nRes.lng,
                            color: '#22c55e',
                            weight: 3,
                            cellId: nRes.id
                        });
                    }

                    neighborRows.push({
                        type: `N${idx + 1}`,
                        name: nRes.name || 'Unknown',
                        cellId: nRes.id,
                        sc: n.pci,
                        rscp: n.rscp,
                        ecno: n.ecno,
                        freq: n.freq
                    });
                });
            }

            // Draw Connections
            if (window.mapRenderer && window.mapRenderer.drawConnections) {
                window.mapRenderer.drawConnections({ lat: p.lat, lng: p.lng }, connectionTargets);
            }


            // --- RENDER HTML ---
            const renderRow = (d, isBold = false) => {
                const hasId = d.cellId !== undefined && d.cellId !== null;
                // Removed text-decoration:underline per user request
                const cursorStyle = hasId ? 'cursor:pointer;' : '';
                // FIX: Add quotes around d.cellId to prevent "RNC/CID" from being treated as division (871/123 = 7.08)
                const clickAttr = hasId ? `onclick="window.mapRenderer.highlightCell('${d.cellId}')"` : '';

                return `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding:4px 4px; color:#aaa;">${d.type}</td>
                    <td style="padding:4px 4px; color:#fff; font-weight:${isBold ? 'bold' : 'normal'}; max-width:150px; overflow:hidden; text-overflow:ellipsis; ${cursorStyle}" 
                        title="${d.name}" ${clickAttr}>
                        ${d.name}
                    </td>
                    <td style="padding:4px 4px; text-align:right;">${d.sc}</td>
                    <td style="padding:4px 4px; text-align:right;">${d.rscp !== undefined && d.rscp !== '-' ? Number(d.rscp).toFixed(1) : '-'}</td>
                    <td style="padding:4px 4px; text-align:right;">${d.ecno !== undefined && d.ecno !== '-' ? Number(d.ecno).toFixed(1) : '-'}</td>
                    <td style="padding:4px 4px; text-align:right;">${d.freq}</td>
                </tr>
            `};

            let tableRows = '';
            tableRows += renderRow(servingData, true); // Serving in Bold Name? or Type? User said "first line is cell name" (header), but also table.
            activeRows.forEach(r => tableRows += renderRow(r));
            neighborRows.forEach(r => tableRows += renderRow(r));


            content.innerHTML = `
                <!-- Header: Serving Cell Name -->
                <div style="font-size: 15px; font-weight: 700; color: #22c55e; margin-bottom: 2px;">
                    ${servingRes.name || 'Unknown Site'}
                </div>

                <!-- Subheader: Lat/Lng -->
                <div style="font-size: 11px; color: #888; margin-bottom: 10px; display:flex; gap:10px;">
                    <span>Lat: ${p.lat.toFixed(6)}</span>
                    <span>Lng: ${p.lng.toFixed(6)}</span>
                    <span style="margin-left:auto; color:#666;">${p.time}</span>
                </div>

                <!-- Unified Table -->
                 <table style="width:100%; border-collapse: collapse; font-size:11px; color:#ddd;">
                    <tr style="border-bottom: 1px solid #555; text-align:left;">
                        <th style="padding:4px 4px; color:#888; font-weight:600;">Type</th>
                        <th style="padding:4px 4px; color:#888; font-weight:600;">Cell Name</th>
                        <th style="padding:4px 4px; color:#888; font-weight:600; text-align:right;">SC</th>
                        <th style="padding:4px 4px; color:#888; font-weight:600; text-align:right;">RSCP</th>
                        <th style="padding:4px 4px; color:#888; font-weight:600; text-align:right;">EcNo</th>
                        <th style="padding:4px 4px; color:#888; font-weight:600; text-align:right;">Freq</th>
                    </tr>
                    ${tableRows}
                </table>
            `;
        };

        // Event Listeners for Controls
        const updateChartStyle = () => {
            // No Type Select anymore, or ignored

            chartSettings.servingColor = document.getElementById('pickerServing').value;
            chartSettings.useGradient = document.getElementById('checkGradient').checked;
            chartSettings.servingWidth = document.getElementById('rangeServingWidth').value;

            if (isComposite) {
                chartSettings.n1Color = document.getElementById('pickerN1').value;
                chartSettings.n1Width = document.getElementById('rangeN1Width') ? document.getElementById('rangeN1Width').value : 2;
                chartSettings.n2Color = document.getElementById('pickerN2').value;
                chartSettings.n2Width = document.getElementById('rangeN2Width') ? document.getElementById('rangeN2Width').value : 2;
                chartSettings.n3Color = document.getElementById('pickerN3').value;
                chartSettings.n3Width = document.getElementById('rangeN3Width') ? document.getElementById('rangeN3Width').value : 2;
            }

            // Update Both Charts (Data & Options if needed)
            lineChartInstance.data = getChartConfigData('line');
            lineChartInstance.update();

            barChartInstance.data = getChartConfigData('bar');
            barChartInstance.update();
        };

        // Bind events
        document.getElementById('chartTypeSelect').addEventListener('change', updateChartStyle);
        document.getElementById('pickerServing').addEventListener('input', updateChartStyle);
        document.getElementById('checkGradient').addEventListener('change', updateChartStyle);
        document.getElementById('rangeServingWidth').addEventListener('input', updateChartStyle);

        if (isComposite) {
            document.getElementById('pickerN1').addEventListener('input', updateChartStyle);
            document.getElementById('rangeN1Width').addEventListener('input', updateChartStyle);
            document.getElementById('pickerN2').addEventListener('input', updateChartStyle);
            document.getElementById('rangeN2Width').addEventListener('input', updateChartStyle);
            document.getElementById('pickerN3').addEventListener('input', updateChartStyle);
            document.getElementById('rangeN3Width').addEventListener('input', updateChartStyle);
        }

        // Helper for "Window of 10" Zoom
        const zoomToActiveWindow = () => {
            if (lineChartInstance && activeIndex !== null && activeIndex >= 0) {
                const range = 5; // +/- 5 points = Window of ~10 (11 actually)
                const min = Math.max(0, activeIndex - range);
                const max = Math.min(lineChartInstance.data.labels.length - 1, activeIndex + range);

                // Update Scales directly for "Window" zoom
                lineChartInstance.options.scales.x.min = min;
                lineChartInstance.options.scales.x.max = max;
                lineChartInstance.update();
            } else {
                if (lineChartInstance) lineChartInstance.zoom(1.1);
            }
        };
        // Expose globally for Sync
        window.zoomChartToActive = zoomToActiveWindow;

        document.getElementById('zoomInBtn').onclick = zoomToActiveWindow;
        document.getElementById('zoomOutBtn').onclick = () => { lineChartInstance.zoom(0.9); };
        document.getElementById('resetZoomBtn').onclick = () => { lineChartInstance.resetZoom(); };

    }

    // Grid Logic (Moved from openChartModal)
    let currentGridLogId = null;
    let currentGridColumns = [];

    function renderGrid() {
        try {
            if (!window.currentGridLogId) return;
            const log = loadedLogs.find(l => l.id === window.currentGridLogId);
            if (!log) return;

            // Determine container
            let container = document.getElementById('gridBody');

            if (!container) {
                console.error("Grid container not found");
                return;
            }

            // Update Title
            const titleEl = document.getElementById('gridTitle');
            if (titleEl) titleEl.textContent = `Grid View: ${log.name}`;

            // Build Table
            let tableHtml = `<table style="width:100%; border-collapse:collapse; color:#eee; font-size:12px;">
                <thead style="position:sticky; top:0; background:#333; height:30px;">
                    <tr>
                        <th style="padding:4px 8px; text-align:left;">Time</th>
                        <th style="padding:4px 8px; text-align:left;">Lat</th>
                        <th style="padding:4px 8px; text-align:left;">Lng</th>`;

            window.currentGridColumns.forEach(col => {
                tableHtml += `<th style="padding:4px 8px; text-align:left; text-transform:uppercase;">${col}</th>`;
            });
            tableHtml += `</tr></thead><tbody>`;

            let rowsHtml = '';
            const limit = 5000; // Limit for performance

            log.points.slice(0, limit).forEach((p, i) => {
                // Add ID and Click Handler
                let row = `<tr id="grid-row-${i}" class="grid-row" onclick="window.globalSync('${log.id}', ${i}, 'grid')" style="cursor:pointer; transition: background 0.1s;">
                <td style="padding:4px 8px; border-bottom:1px solid #333;">${p.time}</td>
                <td style="padding:4px 8px; border-bottom:1px solid #333;">${p.lat.toFixed(5)}</td>
                <td style="padding:4px 8px; border-bottom:1px solid #333;">${p.lng.toFixed(5)}</td>`;

                window.currentGridColumns.forEach(col => {
                    let val = p[col];

                    // Handling complex parsing access
                    if (col.startsWith('n') && col.includes('_')) {
                        // Neighbors
                        const parts = col.split('_'); // n1_rscp -> [n1, rscp]
                        const nIdx = parseInt(parts[0].replace('n', '')) - 1;
                        let field = parts[1];

                        // Map 'sc' to 'pci' for neighbors as parser stores it as pci
                        if (field === 'sc') field = 'pci';

                        if (p.parsed && p.parsed.neighbors && p.parsed.neighbors[nIdx]) {
                            const nestedVal = p.parsed.neighbors[nIdx][field];
                            if (nestedVal !== undefined) val = nestedVal;
                        }

                    } else if (col.startsWith('active_set_')) {
                        // Dynamic AS metrics (A1_RSCP, A2_SC, etc)
                        const sub = col.replace('active_set_', ''); // A1_RSCP
                        const lowerSub = sub.toLowerCase(); // a1_rscp
                        val = p[lowerSub]; // Access getter directly
                    } else if (col.startsWith('AS_')) {
                        // Keep backward compatibility for "Active Set" drag drop if it generates AS_A1_RSCP
                        // Format: AS_A1_RSCP
                        const parts = col.split('_'); // [AS, A1, RSCP]
                        const key = parts[1].toLowerCase() + '_' + parts[2].toLowerCase(); // a1_rscp
                        val = p[key];
                    } else {
                        // Standard Column
                        // Try top level, then parsed
                        if (val === undefined && p.parsed && p.parsed.serving && p.parsed.serving[col] !== undefined) val = p.parsed.serving[col];

                        // Special case: level vs rscp vs signal
                        if ((col === 'rscp' || col === 'rscp_not_combined') && (val === undefined || val === null)) {
                            val = p.level;
                            if (val === undefined && p.parsed && p.parsed.serving) val = p.parsed.serving.level;
                        }

                        // Fallback for Freq
                        if (col === 'freq' && (val === undefined || val === null)) {
                            val = p.freq;
                        }
                    }

                    // Special formatting for Cell ID in Grid
                    if (col.toLowerCase() === 'cellid' && p.rnc !== null && p.rnc !== undefined) {
                        const cid = p.cid !== undefined && p.cid !== null ? p.cid : (p.cellId & 0xFFFF);
                        val = `${p.rnc}/${cid}`;
                    }

                    // Format numbers
                    if (val === undefined || val === null) val = '';
                    if (typeof val === 'number') {
                        if (String(val).includes('.')) val = val.toFixed(2); // Cleaner floats
                    }

                    row += `<td style="padding:4px 8px; border-bottom:1px solid #333;">${val}</td>`;
                });
                row += `</tr>`;
                rowsHtml += row;
            });

            tableHtml += rowsHtml + '</tbody></table>';
            container.innerHTML = tableHtml;

        } catch (err) {
            console.error('Render Grid Error', err);
        }
    };

    // ----------------------------------------------------
    // GLOBAL SYNC HIGHLIGHTER
    // ----------------------------------------------------
    window.highlightPoint = (logId, index) => {
        // 1. Highlight Grid Row
        if (window.currentGridLogId === logId) {
            const rows = document.querySelectorAll('.grid-row');
            rows.forEach(r => r.classList.remove('selected-row'));

            const row = document.getElementById(`grid-row-${index}`);
            if (row) {
                row.classList.add('selected-row');
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        // 2. Highlight Map Marker (if map renderer supports it)
        if (window.map && window.map.highlightMarker) {
            window.map.highlightMarker(logId, index);
        }

        // 3. Highlight Chart
        if (window.currentChartInstance && window.currentChartLogId === logId) {
            if (window.currentChartActiveIndexSet) window.currentChartActiveIndexSet(index);

            // Zoom to point on chart
            const chart = window.currentChartInstance;
            if (chart.config.type === 'line') {
                const windowSize = 20; // View 20 points around selection
                const newMin = Math.max(0, index - windowSize / 2);
                const newMax = Math.min(chart.data.labels.length - 1, index + windowSize / 2);

                // Update Zoom Limits
                chart.options.scales.x.min = newMin;
                chart.options.scales.x.max = newMax;
                chart.update('none'); // Efficient update
            }
        }

        // 4. Highlight Signaling (Time-based Sync)
        const signalingModal = document.getElementById('signalingModal');
        // Ensure visible
        if (logId && (signalingModal.style.display !== 'none' || window.isSignalingDocked)) {
            if (window.currentSignalingLogId !== logId && window.showSignalingModal) {
                window.showSignalingModal(logId);
            }

            const log = loadedLogs.find(l => l.id === logId);
            if (log && log.points && log.points[index]) {
                const point = log.points[index];
                const targetTime = point.time;
                const parseTime = (t) => {
                    const [h, m, s] = t.split(':');
                    return (parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) * 1000;
                };
                const tTarget = parseTime(targetTime);

                let bestIdx = null;
                let minDiff = Infinity;
                const rows = document.querySelectorAll('#signalingTableBody tr');

                rows.forEach((row) => {
                    if (!row.pointData) return;
                    // Reset style
                    row.classList.remove('selected-row');
                    row.style.background = ''; // Clear inline

                    const t = parseTime(row.pointData.time);
                    const diff = Math.abs(t - tTarget);
                    if (diff < minDiff) { // Sync within 5s
                        minDiff = diff;
                        bestIdx = row;
                    }
                });

                if (bestIdx && minDiff < 5000) {
                    bestIdx.classList.add('selected-row');
                    bestIdx.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    };

    const handleGridDrop = (e) => {
        e.preventDefault();
        e.currentTarget.style.boxShadow = 'none';

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data && data.logId && data.param) {
                // Verify Log ID Match
                if (data.logId !== window.currentGridLogId) {
                    alert('Cannot add metric from a different log. Please open a new grid for that log.');
                    return;
                }

                // Add Column if not exists
                if (data.param === 'active_set') {
                    // Explode into 6 columns
                    const columns = ['AS_A1_RSCP', 'AS_A1_SC', 'AS_A2_RSCP', 'AS_A2_SC', 'AS_A3_RSCP', 'AS_A3_SC'];
                    columns.forEach(col => {
                        if (!window.currentGridColumns.includes(col)) {
                            window.currentGridColumns.push(col);
                        }
                    });
                    renderGrid();
                } else if (!window.currentGridColumns.includes(data.param)) {
                    window.currentGridColumns.push(data.param);
                    renderGrid();
                }
            }
        } catch (err) {
            console.error('Grid Drop Error', err);
        }
    };

    const handleGridDragOver = (e) => {
        e.preventDefault();
        e.currentTarget.style.boxShadow = 'inset 0 0 20px rgba(59, 130, 246, 0.5)';
    };

    const handleGridDragLeave = (e) => {
        e.currentTarget.style.boxShadow = 'none';
    };

    // Initialize Draggable Logic
    function makeElementDraggable(headerEl, containerEl) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        headerEl.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            // Get mouse cursor position at startup
            startX = e.clientX;
            startY = e.clientY;

            // Get element position (removing 'px' to get integer)
            const rect = containerEl.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;

            headerEl.style.cursor = 'grabbing';
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            // Calculate cursor movement
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // Set new position
            containerEl.style.left = (initialLeft + dx) + "px";
            containerEl.style.top = (initialTop + dy) + "px";

            // Remove any margin that might interfere
            containerEl.style.margin = "0";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            headerEl.style.cursor = 'grab';
        }

        headerEl.style.cursor = 'grab';
    }

    // Attach Listeners to Grid Modal
    const gridModal = document.getElementById('gridModal');
    if (gridModal) {
        const content = gridModal.querySelector('.modal-content');
        if (content) {
            content.addEventListener('dragover', handleGridDragOver);
            content.addEventListener('dragleave', handleGridDragLeave);
            content.addEventListener('drop', handleGridDrop);
        }

        // Make Header Draggable
        const header = gridModal.querySelector('.modal-header');
        if (header) {
            makeElementDraggable(header, gridModal);
        }
    }

    // Make Floating Info Panel Draggable
    const floatPanel = document.getElementById('floatingInfoPanel');
    const floatHeader = document.getElementById('infoPanelHeader');
    if (floatPanel && floatHeader) {
        // Reuse existing drag logic helper if simple enough, or roll strict one.
        // makeElementDraggable expects (headerEl, containerEl) and handles absolute positioning.
        // floatPanel is fixed, but logic usually sets top/left style which works for fixed too.
        makeElementDraggable(floatHeader, floatPanel);
    }

    // Attach Listeners to Docked Grid (Enable Drop when Docked)
    const dockedGridEl = document.getElementById('dockedGrid');
    if (dockedGridEl) {
        dockedGridEl.addEventListener('dragover', handleGridDragOver);
        dockedGridEl.addEventListener('dragleave', handleGridDragLeave);
        dockedGridEl.addEventListener('drop', handleGridDrop);
    }

    // Docking Logic
    window.isGridDocked = false;

    // Docking Logic for Grid
    window.dockGrid = () => {
        if (window.isGridDocked) return;
        window.isGridDocked = true;

        const modal = document.getElementById('gridModal');
        // Support both class names during transition or use loose selector
        const modalContent = modal.querySelector('.modal-content') || modal.querySelector('.modal-content-grid');
        const dockContainer = document.getElementById('dockedGrid');

        if (modalContent && dockContainer) {
            // Move Header and Body
            const header = modalContent.querySelector('.grid-modal-header') || modalContent.querySelector('.modal-header');
            const body = modalContent.querySelector('.grid-body') || modalContent.querySelector('.modal-body');

            if (header && body) {
                // Clear placeholders (like dockedGridBody) to prevent layout conflicts
                dockContainer.innerHTML = '';
                dockContainer.appendChild(header);
                dockContainer.appendChild(body);

                // Update UI (Button in Docked View)
                const dockBtn = header.querySelector('.dock-btn') || header.querySelector('.btn-dock');
                if (dockBtn) {
                    dockBtn.innerHTML = '&#8599;'; // Undock Icon (North East Arrow)
                    dockBtn.title = 'Undock';
                    dockBtn.onclick = window.undockGrid; // Correct: Click to Undock
                    dockBtn.style.background = '#555';
                }
                const closeBtn = header.querySelector('.close');
                if (closeBtn) closeBtn.style.display = 'none'; // Hide close button in docked mode

                modal.style.display = 'none'; // Hide modal when docked
                updateDockedLayout(); // Show docked container
            }
        }
    };

    window.toggleGridDock = () => {
        if (window.isGridDocked) window.undockGrid();
        else window.dockGrid();
    };
    window.undockGrid = () => {
        if (!window.isGridDocked) return;
        window.isGridDocked = false;

        const modal = document.getElementById('gridModal');
        const modalContent = modal.querySelector('.modal-content') || modal.querySelector('.modal-content-grid');
        const dockContainer = document.getElementById('dockedGrid');

        // Note: dockContainer has them as direct children now
        const header = dockContainer.querySelector('.grid-modal-header') || dockContainer.querySelector('.modal-header');
        const body = dockContainer.querySelector('.grid-body') || dockContainer.querySelector('.modal-body');

        if (header && body) {
            modalContent.appendChild(header);
            modalContent.appendChild(body);

            // Update UI
            const dockBtn = header.querySelector('.dock-btn') || header.querySelector('.btn-dock');
            if (dockBtn) {
                dockBtn.innerHTML = '&#8601;'; // Undock Icon (fixed from down arrow)
                dockBtn.title = 'Dock';
                dockBtn.onclick = window.dockGrid;
                dockBtn.style.background = '#444'; // fixed color
            }
            // Show Close Button
            const closeBtn = header.querySelector('.close');
            if (closeBtn) closeBtn.style.display = 'block';

            modal.style.display = 'block';
            dockContainer.innerHTML = ''; // Clear remnants
            updateDockedLayout();
        }
        renderGrid();
    };

    // Export Grid to CSV
    window.exportGridToCSV = () => {
        if (!window.currentGridLogId || !window.currentGridColumns) return;
        const log = loadedLogs.find(l => l.id === window.currentGridLogId);
        if (!log) return;

        const headers = ['Time', 'Lat', 'Lng', ...window.currentGridColumns.map(c => c.toUpperCase())];
        const rows = [headers.join(',')];

        // Limit should match render limit or be unlimited for export? 
        // User probably expects ALL points in export. I will export ALL points.
        log.points.forEach(p => {
            // Basic columns
            let rowData = [
                p.time || '',
                p.lat,
                p.lng
            ];

            // Dynamic parameter columns
            window.currentGridColumns.forEach(col => {
                let val = p[col];

                // --- Logic mirrored from renderGrid ---
                // Neighbors
                if (col.startsWith('n') && col.includes('_')) {
                    const parts = col.split('_');
                    const nIdx = parseInt(parts[0].replace('n', '')) - 1;
                    let field = parts[1];
                    if (field === 'sc') field = 'pci';

                    if (p.parsed && p.parsed.neighbors && p.parsed.neighbors[nIdx]) {
                        const nestedVal = p.parsed.neighbors[nIdx][field];
                        if (nestedVal !== undefined) val = nestedVal;
                    }
                } else if (col === 'band' || col === 'rscp' || col === 'rscp_not_combined' || col === 'ecno' || col === 'sc' || col === 'freq' || col === 'lac' || col === 'level' || col === 'active_set') {
                    // Try top level, then parsed
                    if (val === undefined && p.parsed && p.parsed.serving && p.parsed.serving[col] !== undefined) val = p.parsed.serving[col];

                    // Special case fallbacks
                    if ((col === 'rscp' || col === 'rscp_not_combined') && (val === undefined || val === null)) {
                        val = p.level;
                        if (val === undefined && p.parsed && p.parsed.serving) val = p.parsed.serving.level;
                    }
                    if (col === 'freq' && (val === undefined || val === null)) {
                        val = p.freq;
                    }

                }
                // --------------------------------------

                // RNC/CID Formatting for Export (Moved outside to ensure it runs)
                if (col.toLowerCase() === 'cellid' && (p.rnc !== null && p.rnc !== undefined)) {
                    const cid = p.cid !== undefined && p.cid !== null ? p.cid : (p.cellId & 0xFFFF);
                    val = `${p.rnc}/${cid}`;
                }

                if (val === undefined || val === null) val = '';
                // Escape commas for CSV
                if (String(val).includes(',')) val = `"${val}"`;
                rowData.push(val);
            });
            rows.push(rowData.join(','));
        });

        const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `grid_export_${log.name}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Sort Grid (Stub - to prevent error if clicked, though implementation is non-trivial for dynamic cols)
    window.sortGrid = () => {
        alert('Sort functionality coming soon.');
    };

    window.toggleGridDock = () => {
        if (window.isGridDocked) window.undockGrid();
        else window.dockGrid();
    };

    window.openGridModal = (log, param) => {
        window.currentGridLogId = log.id;
        window.currentGridColumns = [param];

        if (window.isGridDocked) {
            document.getElementById('dockedGrid').style.display = 'flex';
            document.getElementById('gridModal').style.display = 'none';
        } else {
            const modal = document.getElementById('gridModal');
            modal.style.display = 'block';
            document.getElementById('dockedGrid').style.display = 'none';
        }

        renderGrid();
    };



    // ----------------------------------------------------
    // EXPORT OPTIM FILE FEATURE
    // ----------------------------------------------------
    window.exportOptimFile = (logId) => {
        const log = loadedLogs.find(l => l.id === logId);
        if (!log) return;

        const headers = [
            'Date', 'Time', 'Latitude', 'Longitude',
            'Serving Band', 'Serving RSCP', 'Serving EcNo', 'Serving SC', 'Serving LAC', 'Serving Freq', 'Serving RNC',
            'N1 Band', 'N1 RSCP', 'N1 EcNo', 'N1 SC', 'N1 LAC', 'N1 Freq',
            'N2 Band', 'N2 RSCP', 'N2 EcNo', 'N2 SC', 'N2 LAC', 'N2 Freq',
            'N3 Band', 'N3 RSCP', 'N3 EcNo', 'N3 SC', 'N3 LAC', 'N3 Freq'
        ];

        // Helper to guess band from freq (Simplified logic matching parser)
        const getBand = (f) => {
            if (!f) return '';
            f = parseFloat(f);
            if (f >= 10562 && f <= 10838) return 'B1 (2100)';
            if (f >= 2937 && f <= 3088) return 'B8 (900)';
            if (f > 10000) return 'High Band';
            if (f < 4000) return 'Low Band';
            return 'Unknown';
        };

        const rows = [];
        rows.push(headers.join(','));

        log.points.forEach(p => {
            if (!p.parsed) return;

            const s = p.parsed.serving;
            const n = p.parsed.neighbors || [];

            const gn = (idx, field) => {
                if (idx >= n.length) return '';
                const nb = n[idx];
                if (field === 'band') return getBand(nb.freq);
                if (field === 'lac') return s.lac;
                return nb[field] !== undefined ? nb[field] : '';
            };

            const row = [
                new Date().toISOString().split('T')[0],
                p.time,
                p.lat,
                p.lng,
                getBand(s.freq),
                s.level,
                s.ecno !== null ? s.ecno : '',
                s.sc,
                s.lac,
                s.freq,
                p.rnc || '',
                gn(0, 'band'), gn(0, 'rscp'), gn(0, 'ecno'), gn(0, 'pci'), gn(0, 'lac'), gn(0, 'freq'),
                gn(1, 'band'), gn(1, 'rscp'), gn(1, 'ecno'), gn(1, 'pci'), gn(1, 'lac'), gn(1, 'freq'),
                gn(2, 'band'), gn(2, 'rscp'), gn(2, 'ecno'), gn(2, 'pci'), gn(2, 'lac'), gn(2, 'freq')
            ];
            rows.push(row.join(','));
        });

        const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${log.name}_optim_export.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    // Expose removeLog globally for the onclick handler (dirty but quick for prototype)
    window.removeLog = (id) => {
        const index = loadedLogs.findIndex(l => l.id === id);
        if (index > -1) {
            map.removeLogLayer(id);
            loadedLogs.splice(index, 1);
            updateLogsList();
            fileStatus.textContent = 'Log removed.';
        }
    };

    // ----------------------------------------------------
    // CENTRALIZED SYNCHRONIZATION
    // ----------------------------------------------------
    window.syncMarker = null; // Global marker for current sync point

    window.globalSync = (logId, index, source) => {
        const log = loadedLogs.find(l => l.id === logId);
        if (!log || !log.points[index]) return;

        const point = log.points[index];

        // 1. Update Map (Marker & View)
        if (source !== 'map') {
            if (!window.syncMarker) {
                window.syncMarker = L.circleMarker([point.lat, point.lng], {
                    radius: 8,
                    color: '#ffff00',
                    weight: 3,
                    fillColor: 'transparent',
                    fillOpacity: 0
                }).addTo(window.map);
            } else {
                window.syncMarker.setLatLng([point.lat, point.lng]);
            }

            // Optional: Pan to point if out of view (or always?)
            // Let's only pan if we haven't panned recently or if it's a click-like event?
            // For chart scrubbing, we might NOT want to pan crazily.
            // Let's pan only if it's NOT a rapid scrub (check source).
            if (source !== 'chart_scrub') {
                window.map.panTo([point.lat, point.lng], { animate: true, duration: 0.5 });
            }
        }

        // 2. Update Charts
        if (source !== 'chart' && source !== 'chart_scrub') {
            if (window.currentChartLogId === logId && window.updateDualCharts) {
                // We need to update the chart's active index WITHOUT triggering a loop
                // updateDualCharts draws the chart.
                // We simply set the index and draw.
                window.updateDualCharts(index, true); // true = skipSync to avoid loop

                // AUTO ZOOM if requested (User Request: Zoom on Click)
                if (window.zoomChartToActive) {
                    window.zoomChartToActive();
                }
            }
        }

        // 3. Update Floating Panel
        if (window.updateFloatingInfoPanel) {
            window.updateFloatingInfoPanel(point);
        }

        // 4. Update Grid
        if (window.currentGridLogId === logId) {
            const row = document.getElementById(`grid-row-${index}`);
            if (row) {
                document.querySelectorAll('.grid-row').forEach(r => r.classList.remove('selected-row'));
                row.classList.add('selected-row');

                if (source !== 'grid') {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }

        // 5. Update Signaling
        if (source !== 'signaling') {
            // Find closest signaling row by time logic (reuised from highlightPoint)
            const targetTime = point.time;
            const parseTime = (t) => {
                const [h, m, s] = t.split(':');
                return (parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) * 1000;
            };
            const tTarget = parseTime(targetTime);
            let bestIdx = null;
            let minDiff = Infinity;
            const rows = document.querySelectorAll('#signalingTableBody tr');
            rows.forEach((row) => {
                if (!row.pointData) return;
                row.classList.remove('selected-row');
                const t = parseTime(row.pointData.time);
                const diff = Math.abs(t - tTarget);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestIdx = row;
                }
            });
            if (bestIdx && minDiff < 5000) {
                bestIdx.classList.add('selected-row');
                bestIdx.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    };

    // Global Sync Listener (Legacy Adapatation)
    window.addEventListener('map-point-clicked', (e) => {
        const { logId, point, source } = e.detail;
        const log = loadedLogs.find(l => l.id === logId);
        if (log) {
            let index = log.points.findIndex(p => p.time === point.time);
            if (index === -1) {
                index = log.points.findIndex(p => Math.abs(p.lat - point.lat) < 1e-6 && Math.abs(p.lng - point.lng) < 1e-6);
            }
            if (index !== -1) {
                window.globalSync(logId, index, source || 'map');
            }
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        fileStatus.textContent = `Loading ${file.name}...`;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            fileStatus.textContent = 'Parsing...';

            setTimeout(() => {
                try {
                    const result = NMFParser.parse(content);
                    // Handle new parser return format (object vs array)
                    const parsedData = Array.isArray(result) ? result : result.points;
                    const technology = Array.isArray(result) ? 'Unknown' : result.tech;
                    const signalingData = !Array.isArray(result) ? result.signaling : [];

                    console.log(`Parsed ${parsedData.length} measurement points and ${signalingData ? signalingData.length : 0} signaling messages. Tech: ${technology}`);

                    if (parsedData.length > 0 || (signalingData && signalingData.length > 0)) {
                        const id = Date.now().toString();
                        const name = file.name.replace(/\.[^/.]+$/, "");

                        // Add to Logs
                        loadedLogs.push({
                            id: id,
                            name: name,
                            points: parsedData,
                            signaling: signalingData,
                            tech: technology
                        });

                        if (parsedData.length > 0) {
                            map.addLogLayer(id, parsedData);
                            const first = parsedData[0];
                            map.setView(first.lat, first.lng);
                        }

                        updateLogsList();
                        fileStatus.textContent = `Loaded ${parsedData.length} pts (${technology})`;

                    } else {
                        fileStatus.textContent = 'No valid data found.';
                    }
                } catch (err) {
                    console.error('Parser Error:', err);
                    fileStatus.textContent = 'Error parsing file: ' + err.message;
                }
            }, 100);
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // Site Import Logic
    const siteInput = document.getElementById('siteInput');
    if (siteInput) {
        siteInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            fileStatus.textContent = `Importing Sites...`;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet);

                    console.log('Imported Rows:', json.length);

                    if (json.length === 0) {
                        fileStatus.textContent = 'No rows found in Excel.';
                        return;
                    }

                    // Parse Sectors
                    // Try to match common headers
                    // Map needs: lat, lng, azimuth, name, cellId, tech, color
                    const sectors = json.map(row => {
                        // Normalize helper: remove spaces, underscores, lowercase
                        const normalize = (str) => str.toString().toLowerCase().replace(/[\s_]/g, '');
                        const rowKeys = Object.keys(row);

                        const getVal = (possibleNames) => {
                            for (let name of possibleNames) {
                                const target = normalize(name);
                                // Check exact match first
                                if (row[name] !== undefined) return row[name];

                                // Check normalized match against all row keys
                                const foundKey = rowKeys.find(k => normalize(k) === target);
                                if (foundKey) return row[foundKey];
                            }
                            return undefined;
                        };

                        const lat = parseFloat(getVal(['lat', 'latitude', 'lat_decimal']));
                        const lng = parseFloat(getVal(['long', 'lng', 'longitude', 'lon', 'long_decimal']));
                        // Extended Azimuth keywords (including 'azimut' for French)
                        const azimuth = parseFloat(getVal(['azimuth', 'azimut', 'dir', 'bearing', 'az']));
                        const name = getVal(['nodeb name', 'nodeb_name', 'nodebname', 'site', 'sitename', 'site_name', 'name', 'site name']);
                        const cellId = getVal(['cell', 'cellid', 'ci', 'cell_name', 'cell id', 'cell_id']);

                        // New Fields for Strict Matching
                        const lac = getVal(['lac', 'location area code']);
                        const pci = getVal(['psc', 'sc', 'pci', 'physcial cell id', 'scrambling code']);
                        const freq = getVal(['downlink uarfcn', 'dl uarfcn', 'uarfcn', 'freq', 'frequency', 'dl freq']);
                        const band = getVal(['band', 'band name', 'freq band']);

                        let tech = getVal(['tech', 'technology', 'system', 'rat']);
                        const cellName = getVal(['cell name', 'cellname']) || '';

                        // Infer Tech from Name if missing
                        if (!tech) {
                            const combinedName = (name + ' ' + cellName).toLowerCase();
                            if (combinedName.includes('4g') || combinedName.includes('lte') || combinedName.includes('earfcn')) tech = '4G';
                            else if (combinedName.includes('3g') || combinedName.includes('umts') || combinedName.includes('wcdma')) tech = '3G';
                            else if (combinedName.includes('2g') || combinedName.includes('gsm')) tech = '2G';
                            else if (combinedName.includes('5g') || combinedName.includes('nr')) tech = '5G';
                        }

                        // Determine Color
                        let color = '#3b82f6';
                        if (tech) {
                            const t = tech.toString().toLowerCase();
                            if (t.includes('3g') || t.includes('umts')) color = '#eab308'; // Yellow/Orange
                            if (t.includes('4g') || t.includes('lte')) color = '#3b82f6'; // Blue
                            if (t.includes('2g') || t.includes('gsm')) color = '#ef4444'; // Red
                            if (t.includes('5g') || t.includes('nr')) color = '#a855f7'; // Purple
                        }

                        return {
                            lat, lng, azimuth: isNaN(azimuth) ? 0 : azimuth,
                            name, siteName: name, // Ensure siteName is present
                            cellName,
                            cellId,
                            lac,
                            pci, sc: pci,
                            freq,
                            band,
                            tech,
                            color
                        };
                    }).filter(s => !isNaN(s.lat) && !isNaN(s.lng));

                    console.log('Parsed Sectors:', sectors.length);

                    if (sectors.length > 0) {
                        map.addSiteLayer(sectors);
                        // Also set initial bounds? 
                        const bounds = L.latLngBounds(sectors.map(s => [s.lat, s.lng]));
                        map.map.fitBounds(bounds.pad(0.1));

                        fileStatus.textContent = `Imported ${sectors.length} sectors.`;
                    } else {
                        fileStatus.textContent = 'No valid site coordinates found.';
                    }

                } catch (err) {
                    console.error('Excel Import Error:', err);
                    fileStatus.textContent = 'Error parsing Excel file.';
                }
            };
            reader.readAsArrayBuffer(file);
            e.target.value = '';
        });
    }

    // Site Settings UI Logic
    const settingsBtn = document.getElementById('siteSettingsBtn');
    const settingsPanel = document.getElementById('siteSettingsPanel');
    const closeSettings = document.getElementById('closeSiteSettings');

    if (settingsBtn && settingsPanel) {
        settingsBtn.onclick = () => {
            settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
        };
        closeSettings.onclick = () => settingsPanel.style.display = 'none';

        // Generic Modal Close
        window.onclick = (event) => {
            if (event.target == document.getElementById('gridModal')) {
                document.getElementById('gridModal').style.display = "none";
            }
            if (event.target == document.getElementById('chartModal')) {
                document.getElementById('chartModal').style.display = "none";
            }
            if (event.target == document.getElementById('signalingModal')) {
                document.getElementById('signalingModal').style.display = "none";
            }
        }


        window.closeSignalingModal = () => {
            document.getElementById('signalingModal').style.display = 'none';
        };



        // Apply to Signaling Modal
        const sigModal = document.getElementById('signalingModal');
        const sigContent = sigModal.querySelector('.modal-content');
        const sigHeader = sigModal.querySelector('.modal-header'); // We need to ensure header exists

        if (sigContent && sigHeader) {
            makeElementDraggable(sigHeader, sigContent);
        }

        window.showSignalingModal = (logId) => {
            console.log('Opening Signaling Modal for Log ID:', logId);
            const log = loadedLogs.find(l => l.id.toString() === logId.toString()); // Ensure string comparison

            if (!log) {
                console.error('Log not found for ID:', logId);
                return;
            }

            currentSignalingLogId = log.id;
            renderSignalingTable();

            // Show modal
            document.getElementById('signalingModal').style.display = 'block';

            // Ensure visibility if it was closed or moved off screen?
            // Reset position if first open? optional.
        };

        window.filterSignaling = () => {
            renderSignalingTable();
        };

        function renderSignalingTable() {
            if (!currentSignalingLogId) return;
            const log = loadedLogs.find(l => l.id.toString() === currentSignalingLogId.toString());
            if (!log) return;

            const filterElement = document.getElementById('signalingFilter');
            const filter = filterElement ? filterElement.value : 'ALL';
            if (!filterElement) console.warn('Signaling Filter Dropdown not found in DOM!');

            const tbody = document.getElementById('signalingTableBody');
            const title = document.getElementById('signalingModalTitle');

            tbody.innerHTML = '';
            title.textContent = `Signaling Data - ${log.name}`; // Changed visual to verify update

            // Filter Data
            let sigPoints = log.signaling || [];
            if (filter !== 'ALL') {
                sigPoints = sigPoints.filter(p => p.category === filter);
            }

            if (sigPoints.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No messages found matching filter.</td></tr>';
            } else {
                const limit = 2000;
                const displayPoints = sigPoints.slice(0, limit);

                if (sigPoints.length > limit) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td colspan="5" style="background:#552200; color:#fff; text-align:center;">Showing first ${limit} of ${sigPoints.length} messages.</td>`;
                    tbody.appendChild(tr);
                }

                displayPoints.forEach((p, index) => {
                    const tr = document.createElement('tr');
                    tr.id = `sig-row-${p.time.replace(/[:.]/g, '')}-${index}`; // Unique ID for scrolling
                    tr.className = 'signaling-row'; // Add class for selection
                    tr.style.cursor = 'pointer';

                    // Row Click = Sync (Map + Chart)
                    tr.onclick = (e) => {
                        // Ignore clicks on buttons
                        if (e.target.tagName === 'BUTTON') return;

                        // 1. Sync Map
                        if (p.lat && p.lng) {
                            window.map.setView([p.lat, p.lng], 16);

                            // Dispatch event for Chart Sync
                            const event = new CustomEvent('map-point-clicked', {
                                detail: { logId: currentSignalingLogId, point: p, source: 'signaling' }
                            });
                            window.dispatchEvent(event);
                        } else {
                            // Try to find closest GPS point by time? 
                            // For now, just try chart sync via time
                            const event = new CustomEvent('map-point-clicked', {
                                detail: { logId: currentSignalingLogId, point: p, source: 'signaling' }
                            });
                            window.dispatchEvent(event);
                        }

                        // Low-level Visual Highlight (Overridden by highlightPoint later)
                        // But good for immediate feedback
                        document.querySelectorAll('.signaling-row').forEach(r => r.classList.remove('selected-row'));
                        tr.classList.add('selected-row');
                    };

                    const mapBtn = (p.lat && p.lng)
                        ? `<button onclick="window.map.setView([${p.lat}, ${p.lng}], 16); event.stopPropagation();" class="btn" style="padding:2px 6px; font-size:10px; background-color:#3b82f6;">Map</button>`
                        : '<span style="color:#666; font-size:10px;">No GPS</span>';

                    // Store point data for the info button handler (simulated via dataset or just passing object index if we could, but stringifying is easier for this hack)
                    // Better: attach object to DOM element directly
                    tr.pointData = p;

                    let typeClass = 'badge-rrc';
                    if (p.category === 'L3') typeClass = 'badge-l3';

                    tr.innerHTML = `
                        <td>${p.time}</td>
                        <td><span class="${typeClass}">${p.category}</span></td>
                        <td>${p.direction}</td>
                        <td style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${p.message}">${p.message}</td>
                        <td>
                            ${mapBtn} 
                            <button onclick="const p = this.parentElement.parentElement.pointData; showSignalingPayload(p); event.stopPropagation();" class="btn" style="padding:2px 6px; font-size:10px; background-color:#475569;">Info</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }

        // Payload Viewer
        function showSignalingPayload(point) {
            const payload = point.payload || 'No Hex Payload Extracted';
            // Simple alert for now, or we can make a nicer modal if requested
            // Let's us a simple custom modal or re-use existing one structure? 
            // Alert is ugly. Let's create a quick "payloadModal" dynamically or just use alert for speed first, then upgrade?
            // User wants "show its RRC data".
            // Let's try to format it nicely.

            alert(`Message: ${point.message}\nTime: ${point.time}\n\nRRC Payload (Hex):\n${payload}\n\nFull Raw Line:\n${point.details}`);
        }
        window.showSignalingPayload = showSignalingPayload;

        const updateSiteStyles = () => {
            const range = document.getElementById('rangeSiteDist').value;
            const beam = document.getElementById('rangeIconBeam').value;
            const opacity = document.getElementById('rangeSiteOpacity').value;
            const color = document.getElementById('pickerSiteColor').value;
            const useOverride = document.getElementById('checkSiteColorOverride').checked;
            const showSiteNames = document.getElementById('checkShowSiteNames').checked;
            const showCellNames = document.getElementById('checkShowCellNames').checked;

            document.getElementById('valRange').textContent = range;
            document.getElementById('valBeam').textContent = beam;
            document.getElementById('valOpacity').textContent = opacity;

            map.updateSiteSettings({
                range: range,
                beamwidth: beam,
                opacity: opacity,
                color: color,
                useOverride: useOverride,
                showSiteNames: showSiteNames,
                showCellNames: showCellNames
            });
        };

        // Listeners
        document.getElementById('rangeSiteDist').addEventListener('input', updateSiteStyles);
        document.getElementById('rangeIconBeam').addEventListener('input', updateSiteStyles);
        document.getElementById('rangeSiteOpacity').addEventListener('input', updateSiteStyles);
        document.getElementById('pickerSiteColor').addEventListener('input', updateSiteStyles);
        document.getElementById('checkSiteColorOverride').addEventListener('change', updateSiteStyles);
        document.getElementById('checkShowSiteNames').addEventListener('change', updateSiteStyles);
        document.getElementById('checkShowCellNames').addEventListener('change', updateSiteStyles);
    }
    // ---------------------------------------------------------
    // ---------------------------------------------------------
    // DOCKING SYSTEM
    // ---------------------------------------------------------
    let isChartDocked = false;
    let isSignalingDocked = false;
    window.isGridDocked = false; // Exposed global

    const bottomPanel = document.getElementById('bottomPanel');
    const bottomContent = document.getElementById('bottomContent');
    const bottomResizer = document.getElementById('bottomResizer');
    const dockedChart = document.getElementById('dockedChart');
    const dockedSignaling = document.getElementById('dockedSignaling');
    const dockedGrid = document.getElementById('dockedGrid');

    // Resizer Logic
    let isResizingBottom = false;

    bottomResizer.addEventListener('mousedown', (e) => {
        isResizingBottom = true;
        document.body.style.cursor = 'ns-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizingBottom) return;
        const containerHeight = document.getElementById('center-pane').offsetHeight;
        const newHeight = containerHeight - (e.clientY - document.getElementById('center-pane').getBoundingClientRect().top);

        // Min/Max constraints
        if (newHeight > 50 && newHeight < containerHeight - 50) {
            bottomPanel.style.height = newHeight + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizingBottom) {
            isResizingBottom = false;
            document.body.style.cursor = 'default';
            // Trigger Resize for Chart if needed
            if (window.currentChartInstance) window.currentChartInstance.resize();
        }
    });

    // Update Layout Visibility
    function updateDockedLayout() {
        const bottomPanel = document.getElementById('bottomPanel');
        const dockedChart = document.getElementById('dockedChart');
        const dockedSignaling = document.getElementById('dockedSignaling');
        const dockedGrid = document.getElementById('dockedGrid');

        if (!bottomPanel || !dockedChart || !dockedSignaling || !dockedGrid) {
            console.warn('Docking elements missing, skipping layout update.');
            return;
        }

        const anyDocked = isChartDocked || isSignalingDocked || window.isGridDocked;

        if (anyDocked) {
            bottomPanel.style.display = 'flex';
            // Force flex basis to 0 0 300px to prevent #map from squashing it
            bottomPanel.style.flex = '0 0 300px';
            bottomPanel.style.height = '300px';
            bottomPanel.style.minHeight = '100px'; // Prevent full collapse
        } else {
            bottomPanel.style.display = 'none';
        }

        dockedChart.style.display = isChartDocked ? 'flex' : 'none';
        dockedSignaling.style.display = isSignalingDocked ? 'flex' : 'none';

        // Explicitly handle Grid Display
        if (window.isGridDocked) {
            dockedGrid.style.display = 'flex';
            dockedGrid.style.flexDirection = 'column'; // Ensure column layout
        } else {
            dockedGrid.style.display = 'none';
        }

        // Count active items
        const activeItems = [isChartDocked, isSignalingDocked, window.isGridDocked].filter(Boolean).length;

        if (activeItems > 0) {
            const width = 100 / activeItems; // e.g. 50% or 33.3%
            // Apply styles
            [dockedChart, dockedSignaling, dockedGrid].forEach(el => {
                // Ensure flex basis is reasonable
                el.style.flex = '1 1 auto';
                el.style.width = `${width}%`;
                el.style.borderRight = '1px solid #444';
                el.style.height = '100%'; // Full height of bottomPanel
            });
            // Remove last border
            if (window.isGridDocked) dockedGrid.style.borderRight = 'none';
            else if (isSignalingDocked) dockedSignaling.style.borderRight = 'none';
            else dockedChart.style.borderRight = 'none';
        }

        // Trigger Chart Resize
        if (isChartDocked && window.currentChartInstance) {
            setTimeout(() => window.currentChartInstance.resize(), 50);
        }
    }

    // Docking Actions
    window.dockChart = () => {
        isChartDocked = true;

        // Close Floating Modal if open
        const modal = document.getElementById('chartModal');
        if (modal) modal.remove();

        updateDockedLayout();

        // Re-open Chart in Docked Mode
        if (window.currentChartLogId) {
            // Ensure ID type match (string handling)
            const log = loadedLogs.find(l => l.id.toString() === window.currentChartLogId.toString());

            if (log && window.currentChartParam) {
                openChartModal(log, window.currentChartParam);
            } else {
                console.error('Docking failed: Log or Param not valid', { log, param: window.currentChartParam });
            }
        }
    };

    window.undockChart = () => {
        isChartDocked = false;
        dockedChart.innerHTML = ''; // Clear docked
        updateDockedLayout();

        // Re-open as Modal
        if (window.currentChartLogId && window.currentChartParam) {
            const log = loadedLogs.find(l => l.id === window.currentChartLogId);
            if (log) openChartModal(log, window.currentChartParam);
        }
    };

    // ---------------------------------------------------------
    // DOCKING SYSTEM - SIGNALING EXTENSION
    // ---------------------------------------------------------

    // Inject Dock Button into Signaling Modal Header if not present
    function ensureSignalingDockButton() {
        // Use a more specific selector or retry mechanism if needed, but for now standard check
        const header = document.querySelector('#signalingModal .modal-header');
        if (header && !header.querySelector('.dock-btn')) {
            const dockBtn = document.createElement('button');
            dockBtn.className = 'dock-btn';
            dockBtn.textContent = 'Dock';
            // Explicitly set onclick attribute to ensure it persists and isn't lost
            dockBtn.setAttribute('onclick', "alert('Docking...'); window.dockSignaling();");
            dockBtn.style.cssText = 'background:#3b82f6; color:white; border:none; padding:4px 10px; cursor:pointer; font-size:11px; margin-left: auto; margin-right: 15px; pointer-events: auto; z-index: 9999; position: relative;';

            // Insert before the close button
            const closeBtn = header.querySelector('.close');
            header.insertBefore(dockBtn, closeBtn);
        }
    }
    // Call it once
    ensureSignalingDockButton();

    window.dockSignaling = () => {
        if (isSignalingDocked) return;
        isSignalingDocked = true;

        // Move Content
        const modalContent = document.querySelector('#signalingModal .modal-content');
        if (!modalContent) {
            console.error('Signaling modal content not found');
            return;
        }
        const header = modalContent.querySelector('.modal-header');
        const body = modalContent.querySelector('.modal-body');

        // Verify elements exist before moving
        if (header && body) {
            dockedSignaling.appendChild(header);
            dockedSignaling.appendChild(body);

            // Modify Header for Docked State
            header.style.borderBottom = '1px solid #444';

            // Fix: Body needs to stretch in flex container
            body.style.flex = '1';
            body.style.overflowY = 'auto'; // Ensure scrollable

            // Change Dock Button to Undock
            const dockBtn = header.querySelector('.dock-btn');
            if (dockBtn) {
                dockBtn.textContent = 'Undock';
                dockBtn.onclick = window.undockSignaling;
                dockBtn.style.background = '#555';
            }

            // Hide Close Button
            const closeBtn = header.querySelector('.close');
            if (closeBtn) closeBtn.style.display = 'none';

            // Hide Modal Wrapper
            document.getElementById('signalingModal').style.display = 'none';

            updateDockedLayout();
        } else {
            console.error('Signaling modal parts missing', { header, body });
            isSignalingDocked = false; // Revert state if failed
        }
    };

    window.undockSignaling = () => {
        if (!isSignalingDocked) return;
        isSignalingDocked = false;

        const header = dockedSignaling.querySelector('.modal-header');
        const body = dockedSignaling.querySelector('.modal-body');
        const modalContent = document.querySelector('#signalingModal .modal-content');

        if (header && body) {
            modalContent.appendChild(header);
            modalContent.appendChild(body);

            // Restore Header
            // Change Undock Button to Dock
            const dockBtn = header.querySelector('.dock-btn');
            if (dockBtn) {
                dockBtn.textContent = 'Dock';
                dockBtn.onclick = window.dockSignaling;
                dockBtn.style.background = '#3b82f6';
            }

            // Show Close Button
            const closeBtn = header.querySelector('.close');
            if (closeBtn) closeBtn.style.display = 'block';
        }

        dockedSignaling.innerHTML = ''; // Should be empty anyway
        updateDockedLayout();

        // Show Modal
        if (currentSignalingLogId) {
            document.getElementById('signalingModal').style.display = 'block';
        }
    };

    // Redefine showSignalingModal to handle visibility only (rendering is same ID based)
    window.showSignalingModal = (logId) => {
        console.log('Opening Signaling Modal for Log ID:', logId);
        const log = loadedLogs.find(l => l.id.toString() === logId.toString());

        if (!log) {
            console.error('Log not found for ID:', logId);
            return;
        }

        currentSignalingLogId = log.id;
        renderSignalingTable();

        if (isSignalingDocked) {
            // Ensure docked view is visible
            updateDockedLayout();
        } else {
            // Show modal
            document.getElementById('signalingModal').style.display = 'block';
            ensureSignalingDockButton();
        }
    };

    // Initial call to update layout state
    updateDockedLayout();

    // Global Function to Update Sidebar List
    const updateLogsList = function () {
        const container = document.getElementById('logsList');
        if (!container) return; // Safety check
        container.innerHTML = '';

        loadedLogs.forEach(log => {
            const item = document.createElement('div');
            // REMOVED overflow:hidden to prevent clipping issues. FORCED display:block to override any cached flex rules.
            item.style.cssText = 'background:#252525; margin-bottom:5px; border-radius:4px; border:1px solid #333; min-height: 50px; display: block !important;';

            // Header
            const header = document.createElement('div');
            header.className = 'log-header';
            header.style.cssText = 'padding:8px 10px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#2d2d2d; border-bottom:1px solid #333;';
            header.innerHTML = `
                <span style="font-weight:bold; color:#ddd; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">${log.name}</span>
                <div style="display:flex; gap:5px;">
                     <!-- Export Button -->
                     <button onclick="window.exportOptimFile('${log.id}'); event.stopPropagation();" title="Export Optim CSV" style="background:#059669; color:white; border:none; width:20px; height:20px; border-radius:3px; cursor:pointer; display:flex; align-items:center; justify-content:center;">⬇</button>
                     <button onclick="event.stopPropagation(); window.removeLog('${log.id}')" style="background:#ef4444; color:white; border:none; width:20px; height:20px; border-radius:3px; cursor:pointer; display:flex; align-items:center; justify-content:center;">×</button>
                </div>
            `;

            // Toggle Logic
            header.onclick = () => {
                const body = item.querySelector('.log-body');
                // Check computed style or inline style
                const isHidden = body.style.display === 'none';
                body.style.display = isHidden ? 'block' : 'none';
            };

            // Body (Default: Visible)
            const body = document.createElement('div');
            body.className = 'log-body';
            body.style.cssText = 'padding:10px; display:block;';

            // Stats
            const count = log.points.length;
            const stats = document.createElement('div');
            stats.style.cssText = 'font-size:10px; color:#888; margin-bottom:8px;';
            stats.innerHTML = `
                <span style="background:#3b82f6; color:white; padding:2px 4px; border-radius:2px;">${log.tech}</span>
                <span style="margin-left:5px;">${count} pts</span>
            `;

            // Actions
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; flex-direction:column; gap:4px;';

            const addAction = (label, param) => {
                const btn = document.createElement('div');
                btn.textContent = label;
                btn.className = 'param-item'; // Add class for styling if needed
                btn.draggable = true; // Make Draggable
                btn.style.cssText = 'padding:4px 8px; background:#333; color:#ccc; font-size:11px; border-radius:3px; cursor:pointer; hover:background:#444; transition:background 0.2s;';

                btn.onmouseover = () => btn.style.background = '#444';
                btn.onmouseout = () => btn.style.background = '#333';

                // Drag Start Handler
                btn.ondragstart = (e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                        logId: log.id,
                        param: param,
                        label: label
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                };

                // Left Click Handler - Opens Context Menu
                // Using onclick to be definitive.
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Click detected on:', label);

                    window.currentContextLogId = log.id;
                    window.currentContextParam = param;

                    const menu = document.getElementById('metricContextMenu');
                    if (menu) {
                        menu.style.display = 'block';
                        menu.style.position = 'fixed'; // FIXED positioning to be safe
                        menu.style.left = `${e.clientX}px`; // Use clientX for fixed
                        menu.style.top = `${e.clientY}px`;  // Use clientY for fixed
                    }
                    return false; // Stop propagation legacy style
                };
                // REMOVED contextmenu handler and previous direct-open logic
                return btn;
            };

            // Helper for Group Headers
            const addHeader = (text) => {
                const d = document.createElement('div');
                d.textContent = text;
                d.style.cssText = 'font-size:10px; color:#aaa; margin-top:8px; margin-bottom:4px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px;';
                return d;
            };

            // GROUP: Serving Cell
            actions.appendChild(addHeader('Serving Cell'));
            actions.appendChild(addAction('Serving RSCP/Level', 'rscp_not_combined'));
            actions.appendChild(addAction('Serving EcNo', 'ecno'));
            actions.appendChild(addAction('Serving SC/SC', 'sc'));
            actions.appendChild(addAction('Serving RNC', 'rnc'));
            actions.appendChild(addAction('Active Set', 'active_set'));
            actions.appendChild(addAction('Serving Freq', 'freq'));
            actions.appendChild(addAction('Serving Band', 'band'));
            actions.appendChild(addAction('LAC', 'lac'));
            actions.appendChild(addAction('Cell ID', 'cellId'));
            actions.appendChild(addAction('Serving Cell Name', 'serving_cell_name'));

            // GROUP: Active Set (Individual)
            actions.appendChild(addHeader('Active Set Members'));
            actions.appendChild(addAction('A1 RSCP', 'active_set_A1_RSCP'));
            actions.appendChild(addAction('A1 SC', 'active_set_A1_SC'));
            actions.appendChild(addAction('A2 RSCP', 'active_set_A2_RSCP'));
            actions.appendChild(addAction('A2 SC', 'active_set_A2_SC'));
            actions.appendChild(addAction('A3 RSCP', 'active_set_A3_RSCP'));
            actions.appendChild(addAction('A3 SC', 'active_set_A3_SC'));

            // GROUP: Neighbors
            actions.appendChild(addHeader('Neighbors'));
            // Neighbors Loop (N1 - N8)
            for (let i = 1; i <= 8; i++) {
                actions.appendChild(addAction(`N${i} RSCP`, `n${i}_rscp`));
                actions.appendChild(addAction(`N${i} EcNo`, `n${i}_ecno`));
                actions.appendChild(addAction(`N${i} SC`, `n${i}_sc`));
            }

            // OUTSIDE GROUPS: Composite & General
            actions.appendChild(document.createElement('hr')).style.cssText = "border:0; border-top:1px solid #444; margin:10px 0;";

            actions.appendChild(addAction('Composite RSCP & Neighbors', 'rscp_not_combined'));

            actions.appendChild(document.createElement('hr')).style.cssText = "border:0; border-top:1px solid #444; margin:10px 0;";

            // GPS & Others
            actions.appendChild(addAction('GPS Speed', 'speed'));
            actions.appendChild(addAction('GPS Altitude', 'alt'));
            actions.appendChild(addAction('Time', 'time'));

            // Resurrected Signaling Modal Button
            const sigBtn = document.createElement('div');
            sigBtn.className = 'metric-item';
            sigBtn.style.padding = '4px 8px';
            sigBtn.style.cursor = 'pointer';
            sigBtn.style.margin = '2px 0';
            sigBtn.style.fontSize = '11px';
            sigBtn.style.color = '#ccc';
            sigBtn.style.borderRadius = '4px';
            sigBtn.style.backgroundColor = 'rgba(168, 85, 247, 0.1)'; // Purple tint
            sigBtn.style.border = '1px solid rgba(168, 85, 247, 0.2)';
            sigBtn.textContent = 'Show Signaling';
            sigBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.showSignalingModal) {
                    window.showSignalingModal(log.id);
                } else {
                    alert('Signaling Modal function missing!');
                }
            };
            sigBtn.onmouseover = () => sigBtn.style.backgroundColor = 'rgba(168, 85, 247, 0.2)';
            sigBtn.onmouseout = () => sigBtn.style.backgroundColor = 'rgba(168, 85, 247, 0.1)';
            actions.appendChild(sigBtn);

            // Add components
            body.appendChild(stats);
            body.appendChild(actions);
            item.appendChild(header);
            item.appendChild(body);
            container.appendChild(item);
        });
    };

    // DEBUG EXPORT FOR TESTING
    window.loadedLogs = loadedLogs;
    window.updateLogsList = updateLogsList;
    window.openChartModal = openChartModal;
    window.showSignalingModal = showSignalingModal;
    window.dockChart = dockChart;
    window.dockSignaling = dockSignaling;
    window.undockChart = undockChart;
    window.undockSignaling = undockSignaling;

    // ----------------------------------------------------
    // EXPORT OPTIM FILE FEATURE
    // ----------------------------------------------------
    window.exportOptimFile = (logId) => {
        const log = loadedLogs.find(l => l.id === logId);
        if (!log) return;

        const headers = [
            'Date', 'Time', 'Latitude', 'Longitude',
            'Serving Band', 'Serving RSCP', 'Serving EcNo', 'Serving SC', 'Serving LAC', 'Serving Freq',
            'N1 Band', 'N1 RSCP', 'N1 EcNo', 'N1 SC', 'N1 LAC', 'N1 Freq',
            'N2 Band', 'N2 RSCP', 'N2 EcNo', 'N2 SC', 'N2 LAC', 'N2 Freq',
            'N3 Band', 'N3 RSCP', 'N3 EcNo', 'N3 SC', 'N3 LAC', 'N3 Freq'
        ];

        // Helper to guess band from freq (Simplified logic matching parser)
        const getBand = (f) => {
            if (!f) return '';
            f = parseFloat(f);
            if (f >= 10562 && f <= 10838) return 'B1 (2100)';
            if (f >= 2937 && f <= 3088) return 'B8 (900)';
            if (f > 10000) return 'High Band';
            if (f < 4000) return 'Low Band';
            return 'Unknown';
        };

        const rows = [];
        rows.push(headers.join(','));

        log.points.forEach(p => {
            if (!p.parsed) return;

            const s = p.parsed.serving;
            const n = p.parsed.neighbors || [];

            const gn = (idx, field) => {
                if (idx >= n.length) return '';
                const nb = n[idx];
                if (field === 'band') return getBand(nb.freq);
                if (field === 'lac') return s.lac;
                return nb[field] !== undefined ? nb[field] : '';
            };

            const row = [
                new Date().toISOString().split('T')[0],
                p.time,
                p.lat,
                p.lng,
                getBand(s.freq),
                s.level,
                s.ecno !== null ? s.ecno : '',
                s.sc,
                s.lac,
                s.freq,
                gn(0, 'band'), gn(0, 'rscp'), gn(0, 'ecno'), gn(0, 'pci'), gn(0, 'lac'), gn(0, 'freq'),
                gn(1, 'band'), gn(1, 'rscp'), gn(1, 'ecno'), gn(1, 'pci'), gn(1, 'lac'), gn(1, 'freq'),
                gn(2, 'band'), gn(2, 'rscp'), gn(2, 'ecno'), gn(2, 'pci'), gn(2, 'lac'), gn(2, 'freq')
            ];
            rows.push(row.join(','));
        });

        const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${log.name}_optim_export.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };



    // ----------------------------------------------------
    // CONTEXT MENU LOGIC (Re-added)
    // ----------------------------------------------------
    window.currentContextLogId = null;
    window.currentContextParam = null;

    window.handleContextAction = (action) => {
        const menu = document.getElementById('metricContextMenu');
        if (menu) menu.style.display = 'none';

        if (!window.currentContextLogId || !window.currentContextParam) return;

        const log = loadedLogs.find(l => l.id === window.currentContextLogId);
        if (!log) return;
        const param = window.currentContextParam;

        if (action === 'map') {
            map.updateLayerMetric(log.id, log.points, param);
        } else if (action === 'chart') {
            window.openChartModal(log, param);
        } else if (action === 'grid') {
            window.openGridModal(log, param);
        }
    };

    // Close context menu on global click
    document.addEventListener('click', () => {
        const menu = document.getElementById('metricContextMenu');
        if (menu) menu.style.display = 'none';
    });

});
