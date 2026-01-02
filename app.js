document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const fileStatus = document.getElementById('fileStatus');
    const logsList = document.getElementById('logsList');

    // Initialize Map
    const map = new MapRenderer('map');
    window.map = map.map; // Expose Leaflet instance globally for inline onclicks
    window.mapRenderer = map; // Expose Renderer helper for debugging/verification

    // Global Listener for Map Rendering Completion (Async Legend)
    window.addEventListener('layer-metric-ready', (e) => {
        // console.log(`[App] layer-metric-ready received for: ${e.detail.metric}`);
        if (typeof window.updateLegend === 'function') {
            window.updateLegend();
        }
    });

    // Map Drop Zone Logic
    const mapContainer = document.getElementById('map');
    mapContainer.addEventListener('dragover', (e) => {
        e.preventDefault(); // Allow Drop
        mapContainer.style.boxShadow = 'inset 0 0 20px rgba(59, 130, 246, 0.5)';
    });

    mapContainer.addEventListener('dragleave', (e) => {
        mapContainer.style.boxShadow = 'none';
    });

    // --- AI Integration Logic ---

    const aiModal = document.getElementById('aiModal');
    const geminiApiKeyInput = document.getElementById('geminiApiKey');
    const aiContent = document.getElementById('aiContent');
    const aiLoading = document.getElementById('aiLoading');

    // Restore API Key if saved
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        geminiApiKeyInput.value = savedKey;
    }

    window.openAIAnalysis = function () {
        aiModal.style.display = 'block';

        // Make Draggable
        const aiModalContent = aiModal.querySelector('.modal-content');
        const aiModalHeader = aiModal.querySelector('.modal-header');
        if (aiModalContent && aiModalHeader) {
            // Ensure function exists (it's defined below in this file or seemingly globally available in this scope)
            if (typeof makeElementDraggable === 'function') {
                makeElementDraggable(aiModalHeader, aiModalContent);
            } else {
                console.warn('makeElementDraggable function not found');
            }
        }
    }

    window.closeAIModal = function () {
        aiModal.style.display = 'none';
    }

    window.saveApiKey = function () {
        const key = geminiApiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            alert('API Key saved!');
        } else {
            alert('Please enter a valid API Key.');
        }
    }

    // Attach Event Listener to Button
    const aiBtn = document.getElementById('aiAnalyzeBtn');
    if (aiBtn) {
        aiBtn.onclick = window.openAIAnalysis;
    }

    // Export KML Logic
    const exportKmlBtn = document.getElementById('exportKmlBtn');
    if (exportKmlBtn) {
        exportKmlBtn.onclick = () => {
            if (!mapRenderer || !mapRenderer.activeLogId) {
                alert('No active log/layer to export. Please load a log and display a metric first.');
                return;
            }

            // Find valid log
            const logId = mapRenderer.activeLogId;
            const log = loadedLogs.find(l => l.id === logId);

            if (!log) {
                alert('Active log data not found.');
                return;
            }

            const metric = mapRenderer.activeMetric || 'level';
            const kmlContent = mapRenderer.exportToKML(log.id, log.points, metric);

            if (!kmlContent) {
                alert('Failed to generate KML.');
                return;
            }

            // Trigger Download
            const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${log.name}_${metric}.kml`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
    }

    const exportSitesKmlBtn = document.getElementById('exportSitesKmlBtn');
    if (exportSitesKmlBtn) {
        exportSitesKmlBtn.onclick = () => {
            if (!mapRenderer || !mapRenderer.siteData || mapRenderer.siteData.length === 0) {
                alert('No sites imported. Please import sites first.');
                return;
            }

            // Default behavior: Export ALL sites with uniform Grey color
            const kmlContent = mapRenderer.exportSitesToKML(null, '#aaaaaa');

            if (!kmlContent) {
                alert('Failed to generate Sites KML.');
                return;
            }

            const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `All_Sites_${new Date().toLocaleTimeString().replace(/:/g, '')}.kml`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
    }

    window.checkGeminiModels = async function () {
        const key = geminiApiKeyInput.value.trim();
        const debugLog = document.getElementById('aiModelDebugLog');
        if (!key) {
            alert('Please enter an API Key first.');
            return;
        }

        debugLog.style.display = 'block';
        debugLog.textContent = 'Checking available models...';

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            const data = await response.json();

            if (data.error) {
                debugLog.style.color = '#ef4444';
                debugLog.textContent = 'Error: ' + data.error.message;
            } else if (data.models) {
                debugLog.style.color = '#4ade80';
                const names = data.models.map(m => m.name.replace('models/', '')).filter(n => n.includes('gemini'));
                debugLog.textContent = 'Available Gemini Models:\n' + names.join('\n');
            } else {
                debugLog.textContent = 'No models found (Unknown response format).';
            }
        } catch (e) {
            debugLog.style.color = '#ef4444';
            debugLog.textContent = 'Network Error: ' + e.message;
        }
    };

    // AI Provider Logic
    window.toggleAIProvider = function () {
        const providerRadio = document.querySelector('input[name="aiProvider"]:checked');
        const provider = providerRadio ? providerRadio.value : 'gemini';

        const geminiContainer = document.getElementById('geminiKeyContainer');
        const openaiContainer = document.getElementById('openaiKeyContainer');
        const modelSelect = document.getElementById('geminiModelSelect');
        const debugLog = document.getElementById('aiModelDebugLog');

        // Reset debug log
        if (debugLog) debugLog.style.display = 'none';

        if (provider === 'gemini') {
            if (geminiContainer) geminiContainer.style.display = 'flex';
            if (openaiContainer) openaiContainer.style.display = 'none';
            // Populate Gemini Models
            if (modelSelect) {
                modelSelect.innerHTML = `
                    <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp (New)</option>
                    <option value="gemini-flash-latest">Gemini Flash Latest</option>
                    <option value="gemini-pro-latest">Gemini Pro Latest</option>
                    <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash (Latest)</option>
                    <option value="gemini-1.5-flash-001" selected>Gemini 1.5 Flash (v001)</option>
                    <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro (Latest)</option>
                    <option value="gemini-pro">Gemini 1.0 Pro</option>
                `;
            }
        } else {
            if (geminiContainer) geminiContainer.style.display = 'none';
            if (openaiContainer) openaiContainer.style.display = 'flex';
            // Populate OpenAI Models
            if (modelSelect) {
                modelSelect.innerHTML = `
                    <option value="gpt-4o" selected>GPT-4o (Fast & Smart)</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Fast)</option>
                `;
            }
        }
    };

    // Load Saved Keys on Init
    setTimeout(() => {
        const savedGeminiKey = localStorage.getItem('gemini_api_key');
        const savedOpenAIKey = localStorage.getItem('openai_api_key');
        const geminiInput = document.getElementById('geminiApiKey');
        const openaiInput = document.getElementById('openaiApiKey');

        if (savedGeminiKey && geminiInput) geminiInput.value = savedGeminiKey;
        if (savedOpenAIKey && openaiInput) openaiInput.value = savedOpenAIKey;
    }, 1000);

    // Update Save Key function (this was existing, we override or ensure it handles both if bound)
    // Actually, saveApiKey logic needs to be robust, but simple existence check is good.
    window.saveApiKey = function () {
        const geminiInput = document.getElementById('geminiApiKey');
        const openaiInput = document.getElementById('openaiApiKey');

        if (geminiInput && geminiInput.value.trim()) {
            localStorage.setItem('gemini_api_key', geminiInput.value.trim());
        }
        if (openaiInput && openaiInput.value.trim()) {
            localStorage.setItem('openai_api_key', openaiInput.value.trim());
        }
        alert('API Keys saved successfully!');
    };

    async function callOpenAIAPI(key, model, prompt) {
        const url = 'https://api.openai.com/v1/chat/completions';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: "You are an expert RF Optimization Engineer. Analyze drive test data." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'OpenAI API Request Failed');
        }

        return data.choices[0].message.content;
    }

    window.runAIAnalysis = async function () {
        const providerRadio = document.querySelector('input[name="aiProvider"]:checked');
        const provider = providerRadio ? providerRadio.value : 'gemini';
        const model = document.getElementById('geminiModelSelect').value;
        let key = '';

        if (provider === 'gemini') {
            const kInput = document.getElementById('geminiApiKey');
            key = kInput ? kInput.value.trim() : '';
            if (!key) { alert('Please enter a Gemini API Key first.'); return; }
        } else {
            const kInput = document.getElementById('openaiApiKey');
            key = kInput ? kInput.value.trim() : '';
            if (!key) { alert('Please enter an OpenAI API Key first.'); return; }
        }

        if (loadedLogs.length === 0) {
            alert('No logs loaded to analyze.');
            return;
        }

        const aiContent = document.getElementById('aiContent');
        const aiLoading = document.getElementById('aiLoading');
        const apiKeySection = document.getElementById('aiApiKeySection');

        // Show Loading
        if (apiKeySection) apiKeySection.style.display = 'none';
        if (aiContent) aiContent.innerHTML = '';
        if (aiLoading) aiLoading.style.display = 'flex';

        try {
            const metrics = extractLogMetrics();
            const prompt = generateAIPrompt(metrics);
            let result = '';

            if (provider === 'gemini') {
                result = await callGeminiAPI(key, model, prompt);
            } else {
                result = await callOpenAIAPI(key, model, prompt);
            }

            renderAIResult(result);
        } catch (error) {
            console.error("AI Error:", error);
            let userMsg = error.message;
            if (userMsg.includes('API key not valid') || userMsg.includes('Incorrect API key')) userMsg = 'Invalid API Key. Please check your key.';
            if (userMsg.includes('404')) userMsg = 'Model not found or API endpoint invalid.';
            if (userMsg.includes('429') || userMsg.includes('insufficient_quota')) userMsg = 'Quota exceeded. Check your plan.';

            if (aiContent) {
                aiContent.innerHTML = `<div style="color: #ef4444; text-align: center; padding: 20px;">
                    <h3>Analysis Failed</h3>
                    <p><strong>Error:</strong> ${userMsg}</p>
                    <p style="font-size:12px; color:#aaa; margin-top:5px;">Check console for details.</p>
                    <div style="display:flex; justify-content:center; gap:10px; margin-top:20px;">
                         <button onclick="window.runAIAnalysis()" class="btn" style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); width: auto;">Retry</button>
                         <button onclick="document.getElementById('aiApiKeySection').style.display='block'; document.getElementById('aiLoading').style.display='none'; document.getElementById('aiContent').innerHTML='';" class="btn" style="background:#555;">Back</button>
                    </div>
                </div>`;
            }
        } finally {
            if (aiLoading) aiLoading.style.display = 'none';
        }
    }

    function extractLogMetrics() {
        // Aggregate data from all loaded logs or the active one
        // For simplicity, let's look at the first log or combined
        let totalPoints = 0;
        let weakSignalCount = 0;
        let avgRscp = 0;
        let avgEcno = 0;
        let totalRscp = 0;
        let totalEcno = 0;
        let technologies = new Set();
        let collectedCells = {}; // SC -> count

        loadedLogs.forEach(log => {
            log.points.forEach(p => {
                totalPoints++;

                // Tech detection
                let tech = 'Unknown';
                if (p.rscp !== undefined) tech = '3G';
                else if (p.rsrp !== undefined) tech = '4G';
                else if (p.rxLev !== undefined) tech = '2G'; // Simplified
                if (tech !== 'Unknown') technologies.add(tech);

                // 3G Metrics
                if (p.rscp !== undefined && p.rscp !== null) {
                    totalRscp += p.rscp;
                    if (p.rscp < -100) weakSignalCount++;
                }
                if (p.ecno !== undefined && p.ecno !== null) {
                    totalEcno += p.ecno;
                }

                // Top Servers
                if (p.sc !== undefined) {
                    collectedCells[p.sc] = (collectedCells[p.sc] || 0) + 1;
                }
            });
        });

        if (totalPoints === 0) throw new Error("No data points found.");

        const validRscpCount = totalPoints; // Approximation
        avgRscp = (totalRscp / validRscpCount).toFixed(1);
        avgEcno = (totalEcno / validRscpCount).toFixed(1);
        const weakSignalPct = ((weakSignalCount / totalPoints) * 100).toFixed(1);

        // Sort top 5 cells
        const topCells = Object.entries(collectedCells)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([sc, count]) => `SC ${sc} (${((count / totalPoints) * 100).toFixed(1)}%)`)
            .join(', ');

        return {
            totalPoints,
            technologies: Array.from(technologies).join(', '),
            avgRscp,
            avgEcno,
            weakSignalPct,
            topCells
        };
    }

    function generateAIPrompt(metrics) {
        return `You are an expert RF Optimization Engineer. Analyze the following drive test summary data:
        
        - Technologies Found: ${metrics.technologies}
        - Total Samples: ${metrics.totalPoints}
        - Average Signal Strength (RSCP/RSRP): ${metrics.avgRscp} dBm
        - Average Quality (EcNo/RSRQ): ${metrics.avgEcno} dB
        - Weak Coverage Samples (< -100dBm): ${metrics.weakSignalPct}%
        - Top Serving Cells: ${metrics.topCells}

        Provide a concise analysis in Markdown format:
        1. **Overall Health**: Assess the network condition (Good, Fair, Poor).
        2. **Key Issues**: Identify potential problems (e.g., coverage holes, interference, dominance).
        3. **Recommended Actions**: Suggest 3 specific optimization actions (e.g., downtilt, power adjustment, neighbor checks).
        
        Keep it professional and technical.`;
    }

    async function callGeminiAPI(key, model, prompt) {
        // Use selected model
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'API Request Failed');
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    function renderAIResult(markdownText) {
        // Simple Markdown to HTML converter (bold, headings, lists)
        let html = markdownText
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/\n\n/gim, '<br><br>')
            .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>') // Naive list
            .replace(/<\/ul><ul>/gim, '') // Merge lists
            ;

        aiContent.innerHTML = html;

        // Show "Analysis Done" button or reset?
        // We keep the "Generate" button visible in the bottom if user wants to retry.
    }

    mapContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        mapContainer.style.boxShadow = 'none';

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data && data.logId && data.param) {
                // Determine Log and Points
                const log = loadedLogs.find(l => l.id === data.logId);
                if (data.type === 'metric') {
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
        // Datasets arrays (OPTIMIZED: {x,y} format for Decimation)
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

            // OPTIMIZATION: Push {x,y} objects
            dsServing.push({ x: i, y: parseFloat(val) });

            if (isComposite) {
                dsA2.push({ x: i, y: p.a2_rscp !== undefined ? parseFloat(p.a2_rscp) : null });
                dsA3.push({ x: i, y: p.a3_rscp !== undefined ? parseFloat(p.a3_rscp) : null });
                dsN1.push({ x: i, y: p.n1_rscp !== undefined ? parseFloat(p.n1_rscp) : null });
                dsN2.push({ x: i, y: p.n2_rscp !== undefined ? parseFloat(p.n2_rscp) : null });
                dsN3.push({ x: i, y: p.n3_rscp !== undefined ? parseFloat(p.n3_rscp) : null });
            } else {
                dataPoints.push({ x: i, y: parseFloat(val) });
            }
        });

        // Default Settings
        const chartSettings = {
            type: 'bar', // FORCED BAR
            servingColor: '#3b82f6', // BLUE for Serving (A1)
            useGradient: false,
            a2Color: '#3b82f6', // BLUE
            a3Color: '#3b82f6', // BLUE
            n1Color: '#22c55e', // GREEN
            n2Color: '#22c55e', // GREEN
            n3Color: '#22c55e', // GREEN
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
                            <h3 style="margin:0; margin-right:20px; pointer-events:auto; font-size:14px;">${log.name} - ${isComposite ? 'RSCP & Neighbors' : param.toUpperCase()} (Snapshot)</h3>
                            <button id="styleToggleBtn" style="background:#333; color:#ccc; border:1px solid #555; padding:5px 10px; cursor:pointer; pointer-events:auto; font-size:11px;">⚙️ Style</button>
                        </div>
                        <div style="pointer-events:auto; display:flex; gap:10px;">
                            ${dockBtn}
                            ${closeBtn}
                        </div>
                    </div>
                    
                    <!-- Settings Panel -->
                    <div id="${controlsId}" style="display:none; background:#252525; padding:10px; border-bottom:1px solid #444; gap:15px; align-items:center; flex-wrap:wrap;">
                        <!-- Serving Controls -->
                        <div style="display:flex; flex-direction:column; gap:2px; border-right:1px solid #444; padding-right:10px;">
                            <label style="color:#aaa; font-size:10px; font-weight:bold;">Serving</label>
                             <input type="color" id="pickerServing" value="#3b82f6" style="border:none; width:30px; height:20px; cursor:pointer;">
                        </div>

                        ${isComposite ? `
                        <div style="display:flex; flex-direction:column; gap:2px; padding-right:5px;">
                            <label style="color:#aaa; font-size:10px;">N1 Style</label>
                            <input type="color" id="pickerN1" value="#22c55e" style="border:none; width:30px; height:20px; cursor:pointer;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:2px; padding-right:5px;">
                            <label style="color:#aaa; font-size:10px;">N2 Style</label>
                            <input type="color" id="pickerN2" value="#22c55e" style="border:none; width:30px; height:20px; cursor:pointer;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <label style="color:#aaa; font-size:10px;">N3 Style</label>
                            <input type="color" id="pickerN3" value="#22c55e" style="border:none; width:30px; height:20px; cursor:pointer;">
                        </div>
                        ` : ''}
                    </div>

                    <div style="flex:1; padding:10px; display:flex; gap:10px; height: 100%; min-height: 0;">
                        <!-- Bar Chart Section (100%) -->
                        <div id="barChartContainer" style="flex:1; position:relative; min-width:0;">
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

        const barCtx = document.getElementById('barChartCanvas').getContext('2d');

        // Define Gradient Creator (Use Line Context)
        const createGradient = (color1, color2) => {
            const g = barCtx.createLinearGradient(0, 0, 0, 400);
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
                        const text = typeof measure === 'object' ? measure.y.toFixed(1) : (typeof measure === 'number' ? measure.toFixed(1) : measure);

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

                    // Dynamic Data Construction
                    const candidates = [
                        { label: lbl('A1', p.sc), val: valServing, color: chartSettings.servingColor },
                        { label: lbl('A2', p.a2_sc), val: p.a2_rscp, color: chartSettings.a2Color },
                        { label: lbl('A3', p.a3_sc), val: p.a3_rscp, color: chartSettings.a3Color },
                        { label: lbl('N1', n1 ? n1.pci : null), val: (n1 ? n1.rscp : null), color: chartSettings.n1Color },
                        { label: lbl('N2', n2 ? n2.pci : null), val: (n2 ? n2.rscp : null), color: chartSettings.n2Color },
                        { label: lbl('N3', n3 ? n3.pci : null), val: (n3 ? n3.rscp : null), color: chartSettings.n3Color }
                    ];

                    // Filter valid entries
                    // Valid if val is defined, not null, not NaN, and not -999 (placeholder)
                    const validData = candidates.filter(c =>
                        c.val !== undefined &&
                        c.val !== null &&
                        !isNaN(c.val) &&
                        c.val !== -999 &&
                        c.val > -140 // Sanity check for empty/invalid RSCP
                    );

                    return {
                        labels: validData.map(c => c.label),
                        datasets: [{
                            label: 'Signal Strength',
                            data: validData.map(c => mkBar(c.val)),
                            backgroundColor: validData.map(c => c.color),
                            borderColor: '#fff',
                            borderWidth: 1,
                            borderRadius: 4,
                            barPercentage: 0.6, // Make bars slightly thinner
                            categoryPercentage: 0.8
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
                    const width = barCtx.canvas.width;
                    const gradient = barCtx.createLinearGradient(0, 0, width, 0);
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
                        data: log.points.map((p, i) => ({ x: i, y: p.sc !== undefined ? p.sc : (p.parsed && p.parsed.serving ? p.parsed.serving.sc : null) })),
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
                        data: log.points.map((p, i) => ({ x: i, y: p.n1_sc !== undefined ? p.n1_sc : (p.parsed && p.parsed.neighbors && p.parsed.neighbors[0] ? p.parsed.neighbors[0].pci : null) })),
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
                        data: log.points.map((p, i) => ({ x: i, y: p.n2_sc !== undefined ? p.n2_sc : (p.parsed && p.parsed.neighbors && p.parsed.neighbors[1] ? p.parsed.neighbors[1].pci : null) })),
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

        // Common Option Factory
        const getCommonOptions = (isLine) => {
            const opts = {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                normalized: true,
                parsing: isLine ? false : true, // Only disable parsing for Line (custom x/y)
                layout: { padding: { top: 40 } },
                onClick: (e) => {
                    // Only Line Chart drives selection
                    if (isLine) {
                        const points = lineChartInstance.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
                        if (points.length) {
                            activeIndex = points[0].index;
                            if (window.updateDualCharts) {
                                window.updateDualCharts(activeIndex);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: isLine ? 'linear' : 'category', // LINEAR for Line Chart (Decimation), CATEGORY for Bar
                        ticks: {
                            color: '#666',
                            maxTicksLimit: 10,
                            callback: isLine ? function (val, index) {
                                // Map Linear Index back to Label
                                return labels[val] || '';
                            } : undefined
                        },
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
                    } : false,
                    // DECIMATION PLUGIN CONFIG
                    decimation: isLine ? {
                        enabled: true,
                        algorithm: 'min-max', // Preserves peaks, good for signal data
                        samples: 200, // Downsample to ~200 px resolution (very fast)
                        threshold: 500 // Only kick in if > 500 points
                    } : false
                }
            };
            return opts;
        };

        // ... REST OF FILE ...

        // Instantiate Bar Chart
        let barChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: getChartConfigData('bar'),
            options: getCommonOptions(false),
            plugins: [barLabelsPlugin] // Only Bar gets labels
        });

        const updateBarOverlay = () => {
            const overlay = document.getElementById('barOverlayInfo');
            if (overlay) {
                overlay.textContent = (log.points[activeIndex] ? log.points[activeIndex].time : 'N/A');
            }
        };

        // Ensure updateDualCharts uses correct data structure update
        window.updateDualCharts = (idx, skipGlobalSync = false) => {
            activeIndex = idx;
            // No need to rebuild data for Line Chart, just draw updates (selection)
            // But Bar chart relies on getChartConfigData('bar') which is fresh.
            barChartInstance.data = getChartConfigData('bar');
            barChartInstance.update();
            updateBarOverlay();

            if (!skipGlobalSync && log.points[idx]) {
                const source = isScrubbing ? 'chart_scrub' : 'chart';
                window.globalSync(window.currentChartLogId, idx, source);
            }
        };

        // ----------------------------------------------------
        // Drag / Scrubbing Logic for Line Chart
        // ----------------------------------------------------
        // ----------------------------------------------------
        // Drag / Scrubbing Logic for Line Chart
        // ----------------------------------------------------
        let isScrubbing = false;
        const lineCanvas = document.getElementById('lineChartCanvas');

        if (lineCanvas) {
            // Helper to check if mouse is over badge
            const isOverBadge = (e) => {
                if (!lineChartInstance || !lineChartInstance.lastBadgeRect) return false;
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

            // Explicit Click Listener for robust syncing
            lineCanvas.onclick = (e) => {
                handleScrub(e);
                if (activeIndex !== null && lineChartInstance) {
                    // window.zoomChartToActive(); // Check if exists
                }
            };

            lineCanvas.addEventListener('mousedown', (e) => {
                if (isOverBadge(e)) {
                    isScrubbing = true;
                    lineCanvas.style.cursor = 'grabbing';
                    handleScrub(e);
                    e.stopPropagation();
                }
            }, true);

            lineCanvas.addEventListener('mousemove', (e) => {
                if (isScrubbing) {
                    handleScrub(e);
                    lineCanvas.style.cursor = 'grabbing';
                } else {
                    if (isOverBadge(e)) {
                        lineCanvas.style.cursor = 'grab';
                    } else {
                        lineCanvas.style.cursor = 'default';
                    }
                }
            });
        }

        // Store globally for Sync
        window.currentChartLogId = log.id;
        window.currentChartInstance = barChartInstance;

        // Function to update Active Index from Map
        window.currentChartActiveIndexSet = (idx) => {
            window.updateDualCharts(idx, true); // True = Skip Global Sync loopback
        };

        // Global function to update the Floating Info Panel


        // Event Listeners for Controls
        const updateChartStyle = () => {
            // No Type Select anymore, or ignored

            chartSettings.servingColor = document.getElementById('pickerServing').value;
            chartSettings.useGradient = false; // Always false for bar chart

            if (isComposite) {
                chartSettings.n1Color = document.getElementById('pickerN1').value;
                chartSettings.n2Color = document.getElementById('pickerN2').value;
                chartSettings.n3Color = document.getElementById('pickerN3').value;
            }

            // Update Both Charts (Data & Options if needed)
            barChartInstance.data = getChartConfigData('bar');
            barChartInstance.update();
        };

        // Listen for Async Map Rendering Completion - MOVED TO GLOBAL
        // window.addEventListener('layer-metric-ready', (e) => { ... });

        // Handle Theme Change
        document.getElementById('theme-select').addEventListener('change', (e) => {
            updateLegend();
        });
        // Bind events
        document.getElementById('pickerServing').addEventListener('input', updateChartStyle);

        if (isComposite) {
            document.getElementById('pickerN1').addEventListener('input', updateChartStyle);
            document.getElementById('pickerN2').addEventListener('input', updateChartStyle);
            document.getElementById('pickerN3').addEventListener('input', updateChartStyle);
        }

        if (isComposite) {
            document.getElementById('pickerN1').addEventListener('input', updateChartStyle);
            document.getElementById('pickerN2').addEventListener('input', updateChartStyle);
            document.getElementById('pickerN3').addEventListener('input', updateChartStyle);
        }

    }

    // ----------------------------------------------------
    // SEARCH LOGIC (CGPS)
    // ----------------------------------------------------
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    window.searchMarker = null;

    window.handleSearch = () => {
        const query = searchInput.value.trim();
        if (!query) return;

        // Supported Formats:
        // 33.58, -7.60 (Standard)
        // 34,03360748	-6,7520895 (European/Tab)
        // 33.58 -7.60 (Space)

        // Robust Extraction: Find number-like patterns (integer or float with . or ,)
        // Regex: Optional Sign + Digits + Optional (Dot/Comma + Digits)
        const numberPattern = /[-+]?\d+([.,]\d+)?/g;
        const matches = query.match(numberPattern);

        if (matches && matches.length >= 2) {
            // Normalize: Replace ',' with '.' for JS parsing
            const lat = parseFloat(matches[0].replace(',', '.'));
            const lng = parseFloat(matches[1].replace(',', '.'));

            if (!isNaN(lat) && !isNaN(lng)) {
                // Validate Range
                if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                    alert(`Invalid Coordinates: Out of range (${lat}, ${lng}).`); // Added debug info
                    return;
                }

                // Action
                // 1. Zoom Map
                window.map.flyTo([lat, lng], 18, { animate: true, duration: 1.5 });

                // 2. Place Marker
                if (window.searchMarker) window.map.removeLayer(window.searchMarker);

                window.searchMarker = L.marker([lat, lng])
                    .addTo(window.map)
                    .bindPopup(`<b>Search Location</b><br>Lat: ${lat}<br>Lng: ${lng}`)
                    .openPopup();

                // 3. Update Status
                document.getElementById('fileStatus').textContent = `Zoomed to ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

            } else {
                alert("Invalid Coordinates format. Could not parse numbers.");
            }
        } else {
            alert("Could not find two coordinates in input. Please use 'Lat Lng' format.");
        }
    };

    if (searchBtn) {
        searchBtn.onclick = window.handleSearch;
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.handleSearch();
        });
    }

    // ----------------------------------------------------
    // THEMATIC SETTINGS UI LOGIC
    // ----------------------------------------------------
    const themeSettingsBtn = document.getElementById('themeSettingsBtn');
    const themeSettingsPanel = document.getElementById('themeSettingsPanel');
    const closeThemeSettings = document.getElementById('closeThemeSettings');
    const applyThemeBtn = document.getElementById('applyThemeBtn');
    const resetThemeBtn = document.getElementById('resetThemeBtn');
    const themeSelect = document.getElementById('themeSelect');
    const thresholdsContainer = document.getElementById('thresholdsContainer');

    // Legend Elements
    let legendControl = null;

    window.updateLegend = function () {
        if (!window.themeConfig || !window.map) return;

        // Remove existing legend (Legacy Leaflet Control cleanup)
        if (legendControl) {
            if (typeof legendControl.remove === 'function') legendControl.remove();
            legendControl = null;
        }

        const theme = themeSelect ? themeSelect.value : 'level';

        // Remove existing draggable legend if any
        let existingLegend = document.getElementById('draggable-legend');
        if (existingLegend) {
            existingLegend.remove();
        }

        const stats = window.mapRenderer.activeMetricStats || new Map();
        const total = window.mapRenderer.totalActiveSamples || 1;

        const container = document.createElement('div');
        container.id = 'draggable-legend';
        container.setAttribute('style', `
            position: absolute;
            top: 80px; 
            right: 20px;
            width: 320px;
            min-width: 250px;
            max-width: 600px;
            max-height: 480px;
            background-color: rgba(30, 30, 30, 0.95);
            border: 2px solid #555;
            border-radius: 6px;
            color: #fff;
            z-index: 10001; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.6);
            display: flex;
            flex-direction: column;
            resize: both;
            overflow: auto;
        `);

        // Header
        const header = document.createElement('div');
        header.setAttribute('style', `
            padding: 8px 10px;
            background-color: #252525;
            font-weight: bold;
            font-size: 13px;
            border-bottom: 1px solid #444;
            cursor: grab;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 6px 6px 0 0;
            flex-shrink: 0;
        `);

        // Content Body
        const body = document.createElement('div');
        body.setAttribute('style', `
            padding: 10px;
            overflow-y: auto;
            overflow-x: hidden;
            flex: 1;
        `);

        // DISCRETE LEGEND (Cell ID / CID)
        if (theme === 'cellId' || theme === 'cid') {
            let ids = window.mapRenderer ? window.mapRenderer.activeMetricIds : [];
            if (!ids) ids = [];

            const sortedIds = (ids || []).slice().sort((a, b) => {
                const countA = stats.get(a) || 0;
                const countB = stats.get(b) || 0;
                return countB - countA;
            });

            const title = `Serving Cells (${ids.length})`;
            const summary = `Total: ${total}`;

            header.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <div>
                        <span>${title}</span>
                        <span style="font-size:10px; color:#888; margin-left:10px; font-weight:normal;">${summary}</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button id="kmlExportBtn" title="Export dots to KML" style="background:#3b82f6; color:white; border:none; padding:2px 8px; border-radius:4px; font-size:10px; cursor:pointer;">💾 KML</button>
                        <button id="siteKmlExportBtn" title="Export sites (sectors) to KML" style="background:#10b981; color:white; border:none; padding:2px 8px; border-radius:4px; font-size:10px; cursor:pointer;">📡 Sites KML</button>
                        <span onclick="this.closest('#draggable-legend').remove(); window.legendControl=null;" style="cursor:pointer; color:#aaa; font-size:18px; line-height:1;">&times;</span>
                    </div>
                </div>
            `;

            const formatId = (id) => {
                if (!id || id === 'N/A') return id;
                const strId = String(id);
                if (strId.includes('/')) return id;
                const num = Number(strId.replace(/[^\d]/g, ''));
                if (!isNaN(num) && num > 65535) return `${num >> 16}/${num & 0xFFFF}`;
                return id;
            };

            const getSiteName = (id) => {
                if (window.mapRenderer && window.mapRenderer.siteIndex && window.mapRenderer.siteIndex.byId) {
                    const site = window.mapRenderer.siteIndex.byId.get(id);
                    if (site) return site.cellName || site.name || site.siteName || '';
                }
                return '';
            };

            if (sortedIds.length > 0) {
                let html = `<div style="display:flex; flex-direction:column; gap:6px;">`;
                sortedIds.forEach(id => {
                    const color = window.mapRenderer.getDiscreteColor(id);
                    const name = getSiteName(id);
                    const count = stats.get(id) || 0;
                    const pct = ((count / total) * 100).toFixed(1);

                    const label = name ? `<span>${name}</span> <span style="color:#888; font-size:9px;">(${formatId(id)})</span>` : `${formatId(id)}`;
                    html += `
                        <div style="display:flex; align-items:center; border-bottom:1px solid #333; padding-bottom:2px;">
                            <input type="color" value="${color}" 
                                   style="width:16px; height:16px; padding:0; border:1px solid #555; background:none; cursor:pointer; flex-shrink:0;"
                                   onchange="window.mapRenderer.setCustomColor('${id}', this.value); document.dispatchEvent(new CustomEvent('metric-color-changed', { detail: { id: '${id}', color: this.value } }));" />
                            <span style="font-size:11px; white-space:nowrap; font-family:sans-serif; overflow:hidden; text-overflow:ellipsis; flex-grow:1; margin-left:8px;" title="${name || id}">${label}</span>
                            <span style="margin-left:auto; font-size:10px; color:#aaa; font-family:monospace; padding-left:10px; flex-shrink:0;">${count} <span style="color:#666;">(${pct}%)</span></span>
                        </div>
                    `;
                });
                html += `</div>`;
                body.innerHTML = html;
            } else {
                body.innerHTML = `<i style="font-size:11px; color:#f87171;">0 Cell IDs found.</i>`;
            }
        } else {
            // THEMATIC LEGEND (Coverage/Quality)
            const thresholds = window.themeConfig.thresholds[theme];
            if (!thresholds) return;

            header.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <div>
                        <span>${theme.toUpperCase()} Analysis</span>
                        <span style="font-size:10px; color:#888; margin-left:10px; font-weight:normal;">Sum: ${total}</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button id="kmlExportBtn" title="Export to KML" style="background:#3b82f6; color:white; border:none; padding:2px 8px; border-radius:4px; font-size:10px; cursor:pointer;">💾 KML</button>
                        <span onclick="this.closest('#draggable-legend').remove(); window.legendControl=null;" style="cursor:pointer; color:#aaa; font-size:18px; line-height:1;">&times;</span>
                    </div>
                </div>
            `;

            let html = `<div style="display:flex; flex-direction:column; gap:6px;">`;
            thresholds.forEach(t => {
                const count = stats.get(t.label) || 0;
                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';

                html += `
                    <div style="display:flex; align-items:center; border-bottom:1px solid #333; padding-bottom:2px;">
                        <span style="background:${t.color}; width:16px; height:16px; min-width:16px; display:inline-block; margin-right:8px; border-radius:3px; border:1px solid #555;"></span>
                        <span style="font-size:11px; font-family:sans-serif;">${t.label}</span>
                        <span style="margin-left:auto; font-size:10px; color:#aaa; font-family:monospace; padding-left:10px; flex-shrink:0;">${count} <span style="color:#666;">(${pct}%)</span></span>
                    </div>
                `;
            });
            html += `</div>`;
            body.innerHTML = html;
        }

        container.appendChild(header);
        container.appendChild(body);
        document.body.appendChild(container);

        // KML Export Logic
        const kmlBtn = header.querySelector('#kmlExportBtn');
        if (kmlBtn) {
            kmlBtn.onclick = (e) => {
                e.stopPropagation();
                const renderer = window.mapRenderer;
                if (!renderer || !renderer.activeLogId || !renderer.activeMetric) {
                    alert("No active data to export.");
                    return;
                }
                const log = loadedLogs.find(l => l.id === renderer.activeLogId);
                if (!log) {
                    alert("Log data not found.");
                    return;
                }
                const kml = renderer.exportToKML(renderer.activeLogId, log.points, renderer.activeMetric);
                if (!kml) {
                    alert("Failed to generate KML.");
                    return;
                }
                const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${log.name}_${renderer.activeMetric}.kml`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
        }

        // Sites KML Export Logic
        const siteKmlBtn = header.querySelector('#siteKmlExportBtn');
        if (siteKmlBtn) {
            siteKmlBtn.onclick = (e) => {
                e.stopPropagation();
                const renderer = window.mapRenderer;
                if (!renderer || !renderer.siteIndex || !renderer.siteIndex.all) {
                    alert("No site database loaded.");
                    return;
                }

                // Get Active Points to Filter Sites (Requested Feature: "Export only serving sites")
                let activePoints = null;
                if (renderer.activeLogId && window.loadedLogs) {
                    const activeLog = window.loadedLogs.find(l => l.id === renderer.activeLogId);
                    if (activeLog && activeLog.points) {
                        activePoints = activeLog.points;
                    }
                }

                const kml = renderer.exportSitesToKML(activePoints);
                if (!kml) {
                    alert("Failed to generate Sites KML.");
                    return;
                }
                const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Sites_Database_${new Date().getTime()}.kml`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
        }



        if (typeof makeElementDraggable === 'function') {
            makeElementDraggable(header, container);
        }

        legendControl = { remove: () => container.remove(), addTo: () => { } };
    };
    // Hook updateLegend into UI actions
    // Initial Load (delayed to ensure map exists)
    setTimeout(window.updateLegend, 2000);

    // Global Add/Remove Handlers (attached to window for inline onclicks)
    window.removeThreshold = (idx) => {
        const theme = themeSelect.value;
        if (window.themeConfig.thresholds[theme].length <= 1) {
            alert("Must have at least one range.");
            return;
        }
        window.themeConfig.thresholds[theme].splice(idx, 1);
        renderThresholdInputs();
        // Note: Changes not applied to map until "Apply" is clicked, but UI updates immediately.
    };

    window.addThreshold = () => {
        const theme = themeSelect.value;
        // Add a default gray range
        window.themeConfig.thresholds[theme].push({
            min: -120, max: -100, color: '#cccccc', label: 'New Range'
        });
        renderThresholdInputs();
    };

    function renderThresholdInputs() {
        if (!window.themeConfig) return;
        const theme = themeSelect.value; // 'level' or 'quality'
        const thresholds = window.themeConfig.thresholds[theme];
        thresholdsContainer.innerHTML = '';

        thresholds.forEach((t, idx) => {
            const div = document.createElement('div');
            div.className = 'setting-item';
            div.style.marginBottom = '5px';

            // Allow Min/Max editing based on position
            let inputs = '';
            // If it has Min, show Min Input
            if (t.min !== undefined) {
                inputs += `<label style="font-size:10px; color:#aaa;">Min</label>
                           <input type="number" class="thresh-min" data-idx="${idx}" value="${t.min}" style="width:50px; background:#333; border:1px solid #555; color:#fff; font-size:11px; padding:2px;">`;
            } else {
                inputs += `<span style="font-size:10px; color:#aaa; width:50px; display:inline-block;">( -∞ )</span>`;
            }

            // If it has Max, show Max Input
            if (t.max !== undefined) {
                inputs += `<label style="font-size:10px; color:#aaa; margin-left:5px;">Max</label>
                           <input type="number" class="thresh-max" data-idx="${idx}" value="${t.max}" style="width:50px; background:#333; border:1px solid #555; color:#fff; font-size:11px; padding:2px;">`;
            } else {
                inputs += `<span style="font-size:10px; color:#aaa; width:50px; display:inline-block; margin-left:5px;">( +∞ )</span>`;
            }

            // Remove Button
            const removeBtn = `<button onclick="window.removeThreshold(${idx})" style="margin-left:auto; background:none; border:none; color:#ef4444; cursor:pointer;" title="Remove Range">✖</button>`;

            div.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <input type="color" class="thresh-color" data-idx="${idx}" value="${t.color}" style="border:none; width:20px; height:20px; cursor:pointer; margin-right:5px;">
                    ${inputs}
                    ${removeBtn}
                </div>
            `;
            thresholdsContainer.appendChild(div);
        });

        // Add "Add Range" Button at bottom
        const addDiv = document.createElement('div');
        addDiv.style.textAlign = 'center';
        addDiv.style.marginTop = '10px';
        addDiv.innerHTML = `<button onclick="window.addThreshold()" style="background:#3b82f6; border:none; color:white; padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer;">+ Add Range</button>`;
        thresholdsContainer.appendChild(addDiv);
    }

    if (themeSettingsBtn) {
        themeSettingsBtn.onclick = () => {
            themeSettingsPanel.style.display = 'block';
            renderThresholdInputs();
            // Maybe update legend preview? Legend updates on Apply
        };
    }

    if (closeThemeSettings) {
        closeThemeSettings.onclick = () => {
            themeSettingsPanel.style.display = 'none';
        };
    }

    if (themeSelect) {
        themeSelect.onchange = () => {
            renderThresholdInputs();
            // Automatically update legend to preview?
            updateLegend();
        };
    }

    if (applyThemeBtn) {
        applyThemeBtn.onclick = () => {
            const theme = themeSelect.value;
            const inputs = thresholdsContainer.querySelectorAll('.setting-item');

            // Reconstruct thresholds array
            let newThresholds = [];
            inputs.forEach(div => {
                const color = div.querySelector('.thresh-color').value;
                const minInput = div.querySelector('.thresh-min');
                const maxInput = div.querySelector('.thresh-max');

                let t = { color: color };
                if (minInput) t.min = parseFloat(minInput.value);
                if (maxInput) t.max = parseFloat(maxInput.value);

                // Keep label? (Simple logic: recreate label on load or lose it)
                // For now, lose custom label, rely on auto-label in legend
                if (t.min !== undefined && t.max !== undefined) t.label = `${t.min} to ${t.max}`;
                else if (t.min !== undefined) t.label = `> ${t.min}`;
                else if (t.max !== undefined) t.label = `< ${t.max}`;

                newThresholds.push(t);
            });

            // Update Config
            window.themeConfig.thresholds[theme] = newThresholds;

            // Re-render Legend
            updateLegend();

            // Update Map Layers
            // Iterate all visible log layers and re-render if they match current metric type
            loadedLogs.forEach(log => {
                const currentMetric = log.currentParam || 'level'; // We need to create this prop if missing
                const key = window.getThresholdKey(currentMetric);
                if (key === theme) {
                    // Force Re-render
                    map.updateLayerMetric(log.id, log.points, currentMetric);
                }
            });
            alert('Theme Updated!');
        };
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

            // Store ID for dragging context
            window.currentGridLogId = log.id;

            // Build Table
            // Build Table
            // Ensure headers are draggable for metric drop functionality
            let tableHtml = `<table style="width:100%; border-collapse:collapse; color:#eee; font-size:12px;">
                <thead style="position:sticky; top:0; background:#333; height:30px;">
                    <tr>
                        <th style="padding:4px 8px; text-align:left;">Time</th>
                        <th style="padding:4px 8px; text-align:left;">Lat</th>
                        <th style="padding:4px 8px; text-align:left;">Lng</th>
                        <th draggable="true" ondragstart="window.handleHeaderDragStart(event)" data-param="cellId" style="padding:4px 8px; text-align:left; cursor:grab;">RNC/CID</th>`;

            window.currentGridColumns.forEach(col => {
                if (col === 'cellId') return; // Skip cellId as it is handled by RNC/CID column
                tableHtml += `<th draggable="true" ondragstart="window.handleHeaderDragStart(event)" data-param="${col}" style="padding:4px 8px; text-align:left; text-transform:uppercase; cursor:grab;">${col}</th>`;
            });
            tableHtml += `</tr></thead><tbody>`;

            let rowsHtml = '';
            const limit = 5000; // Limit for performance

            log.points.slice(0, limit).forEach((p, i) => {
                // Add ID and Click Handler
                // RNC/CID Formatter
                const rncCid = (p.rnc !== undefined && p.rnc !== null && p.cid !== undefined && p.cid !== null)
                    ? `${p.rnc}/${p.cid}`
                    : (p.cellId || '-');

                let row = `<tr id="grid-row-${i}" class="grid-row" onclick="window.globalSync('${log.id}', ${i}, 'grid')" style="cursor:pointer; transition: background 0.1s;">
                <td style="padding:4px 8px; border-bottom:1px solid #333;">${p.time}</td>
                <td style="padding:4px 8px; border-bottom:1px solid #333;">${p.lat.toFixed(5)}</td>
                <td style="padding:4px 8px; border-bottom:1px solid #333;">${p.lng.toFixed(5)}</td>
                <td style="padding:4px 8px; border-bottom:1px solid #333;">${rncCid}</td>`;

                window.currentGridColumns.forEach(col => {
                    if (col === 'cellId') return; // Skip cellId
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
    // Optimization: Track last highlighted row to avoid O(N) DOM query
    window.lastHighlightedRowIndex = null;

    window.highlightPoint = (logId, index) => {
        // 1. Highlight Grid Row
        if (window.currentGridLogId === logId) {
            // efficient removal
            if (window.lastHighlightedRowIndex !== null && window.lastHighlightedRowIndex !== index) {
                const oldRow = document.getElementById(`grid-row-${window.lastHighlightedRowIndex}`);
                if (oldRow) oldRow.classList.remove('selected-row');
            }

            // efficient addition
            const row = document.getElementById(`grid-row-${index}`);
            if (row) {
                row.classList.add('selected-row');
                // Debounce scroll or check if needed? ScrollIntoView is expensive.
                // Only scroll if strictly necessary? For now, keep it but maybe 'nearest'?
                row.scrollIntoView({ behavior: 'auto', block: 'nearest' }); // 'smooth' is slow for rapid sync
                window.lastHighlightedRowIndex = index;
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
    // --- Global Helper: Lookup Cell Name from SiteData ---
    window.resolveSmartSite = (p) => {
        const NO_MATCH = { name: null, id: null };
        const pci = p.sc || p.pci; // Normalized SC
        const cellId = p.cellId;
        const lac = p.lac;
        const freq = p.freq;
        const lat = p.lat;
        const lng = p.lng;
        const rnc = p.rnc;

        try {
            // 0. Helper & Dist
            if (!window.mapRenderer || !window.mapRenderer.siteData) return NO_MATCH;
            const siteData = window.mapRenderer.siteData;

            const getName = (s) => s.cellName || s.name || s.siteName;
            const getDistSq = (s) => {
                if (lat === undefined || lng === undefined || !s.lat || !s.lng) return 999999999999;
                return Math.pow(s.lat - lat, 2) + Math.pow(s.lng - lng, 2);
            };

            const norm = (val) => String(val).replace(/\s/g, '');

            // 1. Serving Cell Logic: STRICT CellID Match (with SC Disambiguation)
            let match = null;
            if (cellId !== undefined && cellId !== null && cellId !== 'N/A') {
                let candidates = [];

                // A. Exact Match (All candidates via Index)
                if (window.mapRenderer.siteIndex && window.mapRenderer.siteIndex.byId) {
                    const indexed = window.mapRenderer.siteIndex.byId.get(String(cellId));
                    if (indexed) candidates = [indexed];
                } else {
                    // Fallback if index missing
                    // Fallback if index missing
                    // REMOVED LINEAR SCAN: candidates = siteData.filter(s => s.cellId == cellId);
                    // If Index is missing, we simply fail fast.
                }

                // B. Fallback: Short CID + LAC Match
                if (candidates.length === 0 && lac) {
                    const shortCid = cellId & 0xFFFF;
                    if (window.mapRenderer.siteIndex && window.mapRenderer.siteIndex.byId) {
                        const match = window.mapRenderer.siteIndex.byId.get(String(shortCid));
                        if (match && match.lac == lac) candidates = [match];
                    }
                    if (candidates.length === 0) {
                        // REMOVED LINEAR SCAN: candidates = siteData.filter(s => s.cellId == shortCid && s.lac == lac);
                    }
                }

                // C. Fallback: RNC/CID Format Match (Robust)
                if (candidates.length === 0) {
                    // Try decomposition for 28-bit IDs (3G) if RNC is missing but cellId is large
                    let lookupRnc = rnc;
                    let lookupCid = cellId & 0xFFFF;

                    if ((lookupRnc === undefined || lookupRnc === null || lookupRnc === 'N/A') && cellId > 65535) {
                        lookupRnc = cellId >> 16;
                    }

                    if (lookupRnc !== undefined && lookupRnc !== null && lookupRnc !== 'N/A') {
                        const rncCidStr = `${lookupRnc}/${lookupCid}`;
                        if (window.mapRenderer.siteIndex && window.mapRenderer.siteIndex.byId) {
                            const match = window.mapRenderer.siteIndex.byId.get(rncCidStr);
                            if (match) candidates = [match];
                        }
                    }

                    // If Point has "RNC/CID" string directly in cellId
                    if (candidates.length === 0 && String(cellId).includes('/')) {
                        if (window.mapRenderer.siteIndex && window.mapRenderer.siteIndex.byId) {
                            const match = window.mapRenderer.siteIndex.byId.get(String(cellId));
                            if (match) candidates = [match];
                        }
                    }
                }

                // DISAMBIGUATE: If multiple candidates, use SC (pci) to pick the right one
                if (candidates.length > 0) {
                    if (pci !== undefined && pci !== null) {
                        // Try loose match on SC or PCI
                        match = candidates.find(s => s.sc == pci || s.pci == pci);
                    }
                    // Fallback: Use first candidate if no SC match or no SC provided
                    if (!match) match = candidates[0];
                }
            }

            // STALE CELLID CHECK (or MISSING ID RECOVERY):
            // Logic: If (Match found but SC mismatch) OR (No Match found), try SC+Location Search
            const isStale = match && pci !== undefined && pci !== null && (match.sc != pci && match.pci != pci);
            const isMissing = !match;

            if (isStale || isMissing) {
                // Try to find a site primarily by SC + Location (and Freq)
                if (pci !== undefined && pci !== null) {
                    let scCandidates = [];
                    if (window.mapRenderer.siteIndex && window.mapRenderer.siteIndex.bySc) {
                        const indexed = window.mapRenderer.siteIndex.bySc.get(String(pci));
                        if (indexed) scCandidates = [...indexed]; // Copy to avoid mutation
                    } else {
                        // REMOVED LINEAR SCAN: scCandidates = siteData.filter(s => s.pci == pci || s.sc == pci);
                    }
                    if (freq) {
                        const fTol = 2; // Tolerance
                        scCandidates = scCandidates.filter(s => !s.dl_earfcn || Math.abs(s.dl_earfcn - freq) < fTol || !s.uarfcn || Math.abs(s.uarfcn - freq) < fTol);
                    }
                    if (scCandidates.length > 0) {
                        // Pick closest
                        let best = scCandidates[0];
                        let bestDistSq = getDistSq(best);
                        for (let i = 1; i < scCandidates.length; i++) {
                            const dSq = getDistSq(scCandidates[i]);
                            if (dSq < bestDistSq) {
                                best = scCandidates[i];
                                bestDistSq = dSq;
                            }
                        }
                        // If we found a valid SC candidate close enough (< 20km approx 0.2 deg? No, using lat/lng diff directly is flawed if not conv to meters?
                        // Wait, previous code used lat/lng diff directly inside Math.sqrt.
                        // 1 deg lat ~= 111km. 20km ~= 0.18 deg. 
                        // 0.18^2 = 0.0324.
                        // User's previous code check `bestDist < 20000` assuming `getDist` returns meters?
                        // BUT `getDist` above was `Math.sqrt((lat-lat)^2 + ...)`. That returns DEGREES.
                        // So `bestDist < 20000` was ALWAYS TRUE (Degree diff is like 0.001).
                        // So the check was useless. I will keep it logic-equivalent (always true) or fix it?
                        // I will assume degrees. 20km is roughly 0.2 degrees.
                        // 0.2^2 = 0.04.

                        if (best && bestDistSq < 0.04) { // Approx 22km limit
                            // Override match with this "Smart" match
                            match = best;
                            // console.log(`[SmartMatch] Overrode Stale/Missing ID ${cellId} with Site ${match.cellId} (Dist: ${Math.round(bestDist)}m)`);
                        }
                    }
                }
            }

            if (match) {
                return { name: getName(match), id: match.cellId, lat: match.lat, lng: match.lng, site: match };
            }
            return NO_MATCH;

        } catch (e) {
            console.error("Error in resolveSmartSite:", e);
            return NO_MATCH;
        }
    };

    // Global function to update the Floating Info Panel
    window.updateFloatingInfoPanel = (p) => {
        try {
            console.log("[InfoPanel] Updating for point:", p);
            const panel = document.getElementById('floatingInfoPanel');
            const content = document.getElementById('infoPanelContent');
            if (!panel || !content) {
                console.warn("[InfoPanel] Missing panel info elements");
                return;
            }

            // Debug Log
            console.log("DEBUG: updateFloatingInfoPanel called for point:", p);

            // Show panel if hidden
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
            }
        } catch (err) {
            console.error("Error in resolveCellName:", err);
        }
        return NO_MATCH;
    };

    // Global function to update the Floating Info Panel
    window.updateFloatingInfoPanel = (p) => {
        try {
            console.log("[InfoPanel] Updating for point:", p);
            const panel = document.getElementById('floatingInfoPanel');
            const content = document.getElementById('infoPanelContent');
            if (!panel || !content) {
                return;
            }

            if (panel.style.display === 'none') {
                panel.style.display = 'block';
            }

            // --- DATA PREPARATION ---
            let connectionTargets = [];
            const sLac = p.lac || (p.parsed && p.parsed.serving ? p.parsed.serving.lac : null);
            const sFreq = p.freq || (p.parsed && p.parsed.serving ? p.parsed.serving.freq : null);

            // 1. Serving Cell
            // Construct a "point-like" object for serving resolution if needed, but 'p' is usually sufficient
            // But for consistency with new resolveSmartSite(p), we use p directly.
            let servingRes = window.resolveSmartSite(p);

            // Fallback for NMF raw ID logic (point might lack some context but have cellId)
            if (!servingRes.name && p.cellId) {
                // Try again? resolveSmartSite handles p.cellId. 
            }

            if (servingRes.lat && servingRes.lng) {
                connectionTargets.push({
                    lat: servingRes.lat,
                    lng: servingRes.lng,
                    color: '#3b82f6',
                    weight: 8,
                    cellId: servingRes.id
                });
            }

            const safeVal = (v) => (v !== undefined && v !== '-' && !isNaN(v) ? Number(v).toFixed(1) : '-');

            const formatId = (id) => {
                if (!id || id === 'N/A') return id;
                const strId = String(id);
                if (strId.includes('/')) return id;
                const num = Number(strId.replace(/[^\d]/g, ''));
                if (!isNaN(num) && num > 65535) {
                    return `${num >> 16}/${num & 0xFFFF}`;
                }
                return id;
            };

            const servingData = {
                type: 'Serving',
                name: servingRes.name || 'Unknown',
                cellId: servingRes.id || p.cellId,
                displayId: formatId(servingRes.id || p.cellId),
                sc: p.sc,
                rscp: p.rscp !== undefined ? p.rscp : (p.level !== undefined ? p.level : (p.parsed && p.parsed.serving ? p.parsed.serving.level : '-')),
                ecno: p.ecno !== undefined ? p.ecno : (p.parsed && p.parsed.serving ? p.parsed.serving.ecno : '-'),
                freq: sFreq || '-'
            };

            const resolveNeighbor = (pci, cellId, freq) => {
                // Construct synthetic point for neighbor lookup
                return window.resolveSmartSite({
                    sc: pci,
                    cellId: cellId,
                    lac: sLac,
                    freq: freq || sFreq,
                    lat: p.lat,
                    lng: p.lng
                });
            }

            // 2. Active Set
            let activeRows = [];
            if (p.a2_sc !== undefined && p.a2_sc !== null) {
                const a2Res = resolveNeighbor(p.a2_sc, null, sFreq);
                const nA2 = p.parsed && p.parsed.neighbors ? p.parsed.neighbors.find(n => n.pci === p.a2_sc) : null;
                if (a2Res.lat && a2Res.lng) connectionTargets.push({ lat: a2Res.lat, lng: a2Res.lng, color: '#ef4444', weight: 8, cellId: a2Res.id });
                activeRows.push({
                    type: '2nd Active Set', name: a2Res.name || 'Unknown', cellId: a2Res.id, displayId: formatId(a2Res.id || p.a2_cellid), sc: p.a2_sc,
                    rscp: p.a2_rscp || (nA2 ? nA2.rscp : '-'), ecno: nA2 ? nA2.ecno : '-', freq: sFreq || '-'
                });
            }
            if (p.a3_sc !== undefined && p.a3_sc !== null) {
                const a3Res = resolveNeighbor(p.a3_sc, null, sFreq);
                const nA3 = p.parsed && p.parsed.neighbors ? p.parsed.neighbors.find(n => n.pci === p.a3_sc) : null;
                if (a3Res.lat && a3Res.lng) connectionTargets.push({ lat: a3Res.lat, lng: a3Res.lng, color: '#ef4444', weight: 8, cellId: a3Res.id });
                activeRows.push({
                    type: '3rd Active Set', name: a3Res.name || 'Unknown', cellId: a3Res.id, displayId: formatId(a3Res.id || p.a3_cellid), sc: p.a3_sc,
                    rscp: p.a3_rscp || (nA3 ? nA3.rscp : '-'), ecno: nA3 ? nA3.ecno : '-', freq: sFreq || '-'
                });
            }

            // 3. Neighbors & Detected
            let neighborRows = [];
            let detectedRows = [];

            if (p.parsed && p.parsed.neighbors) {
                const activeSCs = [p.sc, p.a2_sc, p.a3_sc].filter(x => x !== undefined && x !== null);

                p.parsed.neighbors.forEach((n, idx) => {
                    if (n.type === 'detected') {
                        const nRes = resolveNeighbor(n.pci, n.cellId, n.freq);
                        detectedRows.push({
                            type: `D${n.idx || (idx + 1)}`,
                            name: nRes.name || 'Unknown',
                            cellId: nRes.id,
                            displayId: formatId(nRes.id || n.cellId),
                            sc: n.pci,
                            rscp: n.rscp,
                            ecno: n.ecno,
                            freq: n.freq
                        });
                    } else if (!activeSCs.includes(n.pci)) {
                        const nRes = resolveNeighbor(n.pci, n.cellId, n.freq);
                        if (nRes.lat && nRes.lng) connectionTargets.push({ lat: nRes.lat, lng: nRes.lng, color: '#22c55e', weight: 3, cellId: nRes.id });
                        neighborRows.push({
                            type: `N${idx + 1}`, name: nRes.name || 'Unknown', cellId: nRes.id, displayId: formatId(nRes.id || n.cellId), sc: n.pci,
                            rscp: n.rscp, ecno: n.ecno, freq: n.freq
                        });
                    }
                });
            }

            if (window.mapRenderer && window.mapRenderer.drawConnections) {
                window.mapRenderer.drawConnections({ lat: p.lat, lng: p.lng }, connectionTargets);
            }

            const renderRow = (d, isBold = false) => {
                const hasId = d.cellId !== undefined && d.cellId !== null;
                const displayId = d.displayId || d.cellId;
                const nameContent = hasId ? `<span>${d.name}</span> <span style="color:#888; font-size:10px;">(${displayId})</span>` : d.name;
                return `
                            <tr style="border-bottom: 1px solid #444; ${isBold ? 'font-weight:700; color:#fff;' : ''}">
                                <td style="padding:4px 4px;">${d.type}</td>
                                <td style="padding:4px 4px; cursor:pointer;" onclick="if(window.mapRenderer && '${d.cellId}') window.mapRenderer.highlightCell('${d.cellId}')">${nameContent}</td>
                                <td style="padding:4px 4px; text-align:right;">${d.sc}</td>
                                <td style="padding:4px 4px; text-align:right;">${safeVal(d.rscp)}</td>
                                <td style="padding:4px 4px; text-align:right;">${safeVal(d.ecno)}</td>
                                <td style="padding:4px 4px; text-align:right;">${d.freq}</td>
                            </tr>`;
            };

            let tableRows = renderRow(servingData, true);
            activeRows.forEach(r => tableRows += renderRow(r));
            neighborRows.forEach(r => tableRows += renderRow(r));
            if (detectedRows.length > 0) {
                detectedRows.forEach(r => tableRows += renderRow(r));
            }

            content.innerHTML = `
                        <div style="font-size: 15px; font-weight: 700; color: #22c55e; margin-bottom: 2px;">${servingRes.name || 'Unknown Site'}</div>
                        <div style="font-size: 11px; color: #888; margin-bottom: 10px; display:flex; gap:10px;">
                            <span>Lat: ${Number(p.lat).toFixed(6)}</span>
                            <span>Lng: ${Number(p.lng).toFixed(6)}</span>
                            <span style="margin-left:auto; color:#666;">${p.time}</span>
                        </div>
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

        } catch (err) {
            console.error("Critical Error in updateFloatingInfoPanel:", err);
        }
    };

    window.syncMarker = null; // Global marker for current sync point


    window.globalSync = (logId, index, source) => {
        const log = loadedLogs.find(l => l.id === logId);
        if (!log || !log.points[index]) return;

        const point = log.points[index];

        // 1. Update Map (Marker & View)
        // 1. Update Map (Marker & View)
        // Always update marker, even if source is map (to show selection highlight)
        if (!window.syncMarker) {
            window.syncMarker = L.circleMarker([point.lat, point.lng], {
                radius: 18, // Larger radius to surround the point
                color: '#ffff00', // Yellow
                weight: 4,
                fillColor: 'transparent',
                fillOpacity: 0
            }).addTo(window.map);
        } else {
            window.syncMarker.setLatLng([point.lat, point.lng]);
            // Ensure style is consistent (in case it was overwritten or different)
            window.syncMarker.setStyle({
                radius: 18,
                color: '#ffff00',
                weight: 4,
                fillColor: 'transparent',
                fillOpacity: 0
            });
        }

        // View Navigation (Zoom/Pan) - User Request: Zoom in on click
        // UPDATED: Keep current zoom, just pan.
        if (source !== 'chart_scrub') {
            // const targetZoom = Math.max(window.map.getZoom(), 17); // Previous logic
            // window.map.flyTo([point.lat, point.lng], targetZoom, { animate: true, duration: 0.5 });

            // New Logic: Pan only, preserve zoom
            window.map.panTo([point.lat, point.lng], { animate: true, duration: 0.5 });
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

    // Global Listener for Custom Legend Color Changes
    window.addEventListener('metric-color-changed', (e) => {
        const { id, color } = e.detail;
        console.log(`[App] Color overridden for ${id} -> ${color}`);

        // Re-render ALL logs currently showing Discrete Metrics (CellId or CID)
        loadedLogs.forEach(log => {
            if (log.currentParam === 'cellId' || log.currentParam === 'cid') {
                window.mapRenderer.addLogLayer(log.id, log.points, log.currentParam);
            }
        });
    });

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

    // SPIDER OPTION: Sector Click Listener
    window.addEventListener('site-sector-clicked', (e) => {
        const sector = e.detail;
        if (!sector || !window.mapRenderer) return;

        console.log("[Spider] Sector Clicked:", sector);

        // Find all points served by this sector
        const targetPoints = [];

        // Calculate "Tip Top" (Outer Edge Center) based on Azimuth
        // Use range from the event (current rendering range)
        const range = sector.range || 200;
        const rad = Math.PI / 180;
        const azRad = (sector.azimuth || 0) * rad;
        const latRad = sector.lat * rad;

        const dy = Math.cos(azRad) * range;
        const dx = Math.sin(azRad) * range;
        const dLat = dy / 111111;
        const dLng = dx / (111111 * Math.cos(latRad));

        const startPt = {
            lat: sector.lat + dLat,
            lng: sector.lng + dLng
        };

        const norm = (v) => v !== undefined && v !== null ? String(v).trim() : '';
        const isValid = (v) => v !== undefined && v !== null && v !== 'N/A' && v !== '';

        loadedLogs.forEach(log => {
            log.points.forEach(p => {
                let isMatch = false;

                // 1. Strict RNC/CID Match (Highest Priority)
                if (isValid(sector.rnc) && isValid(sector.cid) && isValid(p.rnc) && isValid(p.cellId)) {
                    if (norm(sector.rnc) === norm(p.rnc) && norm(sector.cid) === norm(p.cellId)) {
                        isMatch = true;
                    }
                }

                // 2. Generic CellID Match (Fallback)
                if (!isMatch && sector.cellId && isValid(p.cellId)) {
                    if (norm(sector.cellId) === norm(p.cellId)) {
                        isMatch = true;
                    }
                    // Support "RNC/CID" format in sector.cellId
                    else if (sector.cellId.includes('/')) {
                        const parts = sector.cellId.split('/');
                        const cid = parts[parts.length - 1];
                        const rnc = parts.length > 1 ? parts[parts.length - 2] : null;

                        if (rnc && isValid(p.rnc) && norm(p.rnc) === norm(rnc) && norm(p.cellId) === norm(cid)) {
                            isMatch = true;
                        } else if (norm(p.cellId) === norm(cid) && !isValid(p.rnc)) {
                            isMatch = true;
                        }
                    }
                }

                // 3. SC Match (Secondary Fallback)
                if (!isMatch && sector.sc !== undefined && isValid(p.sc)) {
                    if (p.sc == sector.sc) {
                        isMatch = true;
                        // Refine with LAC if available
                        if (sector.lac && isValid(p.lac) && norm(sector.lac) !== norm(p.lac)) {
                            isMatch = false;
                        }
                    }
                }

                if (isMatch) {
                    targetPoints.push({
                        lat: p.lat,
                        lng: p.lng,
                        color: '#ffff00', // Yellow lines
                        weight: 2,
                        dashArray: '4, 4'
                    });
                }
            });
        });

        if (targetPoints.length > 0) {
            console.log(`[Spider] Found ${targetPoints.length} points.`);
            window.mapRenderer.drawConnections(startPt, targetPoints);
            fileStatus.textContent = `Spider: Showing ${targetPoints.length} points for ${sector.cellId || sector.sc}`;
        } else {
            console.warn("[Spider] No matching points found.");
            fileStatus.textContent = `Spider: No points found for ${sector.cellId || sector.sc}`;
            window.mapRenderer.clearConnections();
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        fileStatus.textContent = `Loading ${file.name}...`;

        // NMFS Binary Check
        if (file.name.toLowerCase().endsWith('.nmfs')) {
            const headerReader = new FileReader();
            headerReader.onload = (event) => {
                const arr = new Uint8Array(event.target.result);
                // ASCII for NMFS is 78 77 70 83 (0x4e 0x4d 0x46 0x53)
                // Check if starts with NMFS
                let isNMFS = false;
                if (arr.length >= 4) {
                    if (arr[0] === 0x4e && arr[1] === 0x4d && arr[2] === 0x46 && arr[3] === 0x53) {
                        isNMFS = true;
                    }
                }

                if (isNMFS) {
                    alert("⚠️ SECURE FILE DETECTED\n\nThis is a proprietary Keysight Nemo 'Secure' Binary file (.nmfs).\n\nThis application can only parse TEXT log files (.nmf or .csv).\n\nPlease open this file in Nemo Outdoor/Analyze and export it as 'Nemo File Format (Text)'.");
                    fileStatus.textContent = 'Error: Encrypted NMFS file.';
                    e.target.value = ''; // Reset
                    return;
                } else {
                    // Fallback: Maybe it's a text file named .nmfs? Try parsing as text.
                    console.warn("File named .nmfs but missing signature. Attempting text parse...");
                    parseTextLog(file);
                }
            };
            headerReader.readAsArrayBuffer(file.slice(0, 10));
            return;
        }

        // Excel / CSV Detection (Binary Read)
        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    fileStatus.textContent = 'Parsing Excel...';
                    const data = event.target.result;
                    const result = ExcelParser.parse(data);

                    handleParsedResult(result, file.name);

                } catch (err) {
                    console.error('Excel Parse Error:', err);
                    fileStatus.textContent = 'Error parsing Excel: ' + err.message;
                }
            };
            reader.readAsArrayBuffer(file);
            e.target.value = '';
            return;
        }

        // Standard Text Log
        parseTextLog(file);

        function parseTextLog(f) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                fileStatus.textContent = 'Parsing...';

                setTimeout(() => {
                    try {
                        const result = NMFParser.parse(content);
                        handleParsedResult(result, f.name);
                    } catch (err) {
                        console.error('Parser Error:', err);
                        fileStatus.textContent = 'Error parsing file: ' + err.message;
                    }
                }, 100);
            };
            reader.readAsText(f);
            e.target.value = '';
        }

        function getRandomColor() {
            const letters = '0123456789ABCDEF';
            let color = '#';
            for (let i = 0; i < 6; i++) {
                color += letters[Math.floor(Math.random() * 16)];
            }
            return color;
        }

        function handleParsedResult(result, fileName) {
            // Handle new parser return format (object vs array)
            const parsedData = Array.isArray(result) ? result : result.points;
            const technology = Array.isArray(result) ? 'Unknown' : result.tech;
            const signalingData = !Array.isArray(result) ? result.signaling : [];
            const customMetrics = !Array.isArray(result) ? result.customMetrics : []; // New for Excel

            console.log(`Parsed ${parsedData.length} measurement points and ${signalingData ? signalingData.length : 0} signaling messages. Tech: ${technology}`);

            if (parsedData.length > 0 || (signalingData && signalingData.length > 0)) {
                const id = Date.now().toString();
                const name = fileName.replace(/\.[^/.]+$/, "");

                // Add to Logs
                loadedLogs.push({
                    id: id,
                    name: name,
                    points: parsedData,
                    signaling: signalingData,
                    tech: technology,
                    customMetrics: customMetrics,
                    color: getRandomColor(),
                    visible: true,
                    currentParam: 'level'
                });

                // Update UI
                updateLogsList();

                if (parsedData.length > 0) {
                    console.log('[App] Debug First Point:', parsedData[0]);
                    map.addLogLayer(id, parsedData, 'level');
                    const first = parsedData[0];
                    map.setView(first.lat, first.lng);
                }

                // Add Events Layer (HO Fail, Drop, etc.)
                if (signalingData && signalingData.length > 0) {
                    map.addEventsLayer(id, signalingData);
                }

                fileStatus.textContent = `Loaded: ${name} (${parsedData.length} pts)`;


            } else {
                fileStatus.textContent = 'No valid data found.';
            }
        }
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
    const siteColorBy = document.getElementById('siteColorBy'); // NEW

    if (settingsBtn && settingsPanel) {
        settingsBtn.onclick = () => {
            settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
        };
        closeSettings.onclick = () => settingsPanel.style.display = 'none';

        const updateSiteStyles = () => {
            const range = document.getElementById('rangeSiteDist').value;
            const beam = document.getElementById('rangeIconBeam').value;
            const opacity = document.getElementById('rangeSiteOpacity').value;
            const color = document.getElementById('pickerSiteColor').value;
            const useOverride = document.getElementById('checkSiteColorOverride').checked;
            const showSiteNames = document.getElementById('checkShowSiteNames').checked;
            const showCellNames = document.getElementById('checkShowCellNames').checked;
            const colorBy = siteColorBy ? siteColorBy.value : 'tech';

            document.getElementById('valRange').textContent = range;
            document.getElementById('valBeam').textContent = beam;
            document.getElementById('valOpacity').textContent = opacity;

            if (map) {
                map.updateSiteSettings({
                    range: range,
                    beamwidth: beam,
                    opacity: opacity,
                    color: color,
                    useOverride: useOverride,
                    showSiteNames: showSiteNames,
                    showCellNames: showCellNames,
                    colorBy: colorBy
                });
            }
        };

        // Listeners for Site Settings
        document.getElementById('rangeSiteDist').addEventListener('input', updateSiteStyles);
        document.getElementById('rangeIconBeam').addEventListener('input', updateSiteStyles);
        document.getElementById('rangeSiteOpacity').addEventListener('input', updateSiteStyles);
        document.getElementById('pickerSiteColor').addEventListener('input', updateSiteStyles);
        document.getElementById('checkSiteColorOverride').addEventListener('change', updateSiteStyles);
        document.getElementById('checkShowSiteNames').addEventListener('change', updateSiteStyles);
        document.getElementById('checkShowCellNames').addEventListener('change', updateSiteStyles);
        if (siteColorBy) siteColorBy.addEventListener('change', updateSiteStyles);

        // Initial sync
        setTimeout(updateSiteStyles, 100);
    }

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

            // NEW: DYNAMIC METRICS VS FIXED METRICS
            // If customMetrics exist, use them. Else use Fixed NMF list.

            if (log.customMetrics && log.customMetrics.length > 0) {
                actions.appendChild(addHeader('Detected Metrics'));

                log.customMetrics.forEach(metric => {
                    // Create clean label: e.g. "RSRP (dBm)" -> "RSRP" or just keep originals
                    // For dynamic, original is best to avoid confusion.
                    actions.appendChild(addAction(metric, metric));
                });

                // Also add "Time" and "GPS" if they exist in basic points but maybe not in customMetrics list?
                // The parser excludes Time/Lat/Lon from customMetrics.
                // So we can re-add them if we want buttons for them (usually just Time/Speed).
                actions.appendChild(document.createElement('hr')).style.cssText = "border:0; border-top:1px solid #444; margin:10px 0;";
                actions.appendChild(addAction('Time', 'time'));

            } else {
                // FALLBACK: OLD STATIC NMF METRICS

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
            }

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
            if (window.mapRenderer) {
                // Perform visualization
                window.mapRenderer.updateLayerMetric(log.id, log.points, param);

                // Auto-Switch Theme/Legend
                const themeSelect = document.getElementById('themeSelect');
                if (themeSelect) {
                    // Check if 'cellId' option exists, if not add it (though it likely doesn't match a config key)
                    // We handle 'cellId' specially in updateLegend now.
                    if (param === 'cellId') {
                        // Temporarily add option if missing or just hijack the value
                        let opt = Array.from(themeSelect.options).find(o => o.value === 'cellId');
                        if (!opt) {
                            opt = document.createElement('option');
                            opt.value = 'cellId';
                            opt.text = 'Cell ID';
                            themeSelect.add(opt);
                        }
                        themeSelect.value = 'cellId';
                    } else if (param.toLowerCase().includes('qual')) {
                        themeSelect.value = 'quality';
                    } else {
                        themeSelect.value = 'level';
                    }
                    // Trigger Change Listener to update Legend
                    // Or call directly:
                    if (typeof window.updateLegend === 'function') window.updateLegend();
                }
            }
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

    // DRAG AND DROP MAP HANDLERS
    window.allowDrop = (ev) => {
        ev.preventDefault();
    };

    window.drop = (ev) => {
        ev.preventDefault();
        try {
            const data = JSON.parse(ev.dataTransfer.getData("application/json"));
            if (!data || !data.logId || !data.param) return;

            console.log("Dropped Metric:", data);

            const log = loadedLogs.find(l => l.id.toString() === data.logId.toString());
            if (!log) return;

            // 1. Determine Theme based on Metric
            const p = data.param.toLowerCase();
            const l = data.label.toLowerCase();
            const themeSelect = document.getElementById('themeSelect');
            let newTheme = 'level'; // Default

            // Heuristic for Quality vs Coverage vs CellID
            if (p === 'cellid' || p === 'cid' || p === 'cell_id') {
                // Temporarily add option if missing or just hijack the value
                let opt = Array.from(themeSelect.options).find(o => o.value === 'cellId');
                if (!opt) {
                    opt = document.createElement('option');
                    opt.value = 'cellId';
                    opt.text = 'Cell ID';
                    themeSelect.add(opt);
                }
                newTheme = 'cellId';
            } else if (p.includes('qual') || p.includes('ecno') || p.includes('sinr')) {
                newTheme = 'quality';
            }

            // 2. Apply Theme if detected
            if (newTheme && themeSelect) {
                themeSelect.value = newTheme;
                console.log(`[Drop] Switched theme to: ${newTheme}`);

                // Trigger any change handlers if strictly needed, but we usually just call render
                if (window.renderThresholdInputs) {
                    window.renderThresholdInputs();
                }
                // Force Legend Update
                // Force Legend Update (REMOVED: let Async event handle it)
                // if (window.updateLegend) {
                //    window.updateLegend();
                // }
            }

            // 3. Visualize
            if (window.mapRenderer) {
                log.currentParam = data.param; // SYNC: Update active metric for this log
                window.mapRenderer.updateLayerMetric(log.id, log.points, data.param);

                // Ensure Legend is updated AGAIN after metric update (metrics might be calc'd inside renderer)
                // Ensure Legend is updated AGAIN after metric update (metrics might be calc'd inside renderer)
                // REMOVED: let Async event handle it to avoid "0 Cell IDs" flash
                // setTimeout(() => {
                //     if (window.updateLegend) window.updateLegend();
                // }, 100);
            } else {
                console.error("[Drop] window.mapRenderer is undefined!");
                alert("Internal Error: Map Renderer not initialized.");
            }

        } catch (e) {
            console.error("Drop failed:", e);
            alert("Drop failed: " + e.message);
        }
    };

});


