class MapRenderer {
    constructor(elementId) {
        // PERFORMANCE: preferCanvas = true forces Leaflet to use Canvas renderer for Vectors
        // This makes rendering 10k-50k points buttery smooth compared to SVG.
        this.map = L.map(elementId, { preferCanvas: true }).setView([33.5, -7.5], 6); // Default to Morocco view

        // Base Maps
        const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        });

        const lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        });

        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        });

        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        });

        const googleHybridLayer = L.tileLayer('http://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}', {
            attribution: 'Google',
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        });

        // Set Default
        darkLayer.addTo(this.map);

        const baseMaps = {
            "Dark": darkLayer,
            "Light": lightLayer,
            "Streets": osmLayer,
            "Satellite": satelliteLayer,
            "Hybrid": googleHybridLayer
        };

        L.control.layers(baseMaps).addTo(this.map);

        this.logLayers = {}; // Store layers by ID/Name

        // Site Labels Layer (separate for performance)
        this.siteLabelsLayer = L.layerGroup();
        this.connectionsLayer = L.layerGroup().addTo(this.map); // Layer for lines
        this.customDiscreteColors = {}; // User-overridden colors (ID -> Color)

        // Optim: Only show labels on high zoom
        this.map.on('zoomend', () => this.updateLabelVisibility());
    }

    updateLabelVisibility() {
        const zoom = this.map.getZoom();
        const show = (this.siteSettings && (this.siteSettings.showSiteNames || this.siteSettings.showCellNames));

        // Threshold: Only show if zoom >= 14
        if (show && zoom >= 14) {
            if (!this.map.hasLayer(this.siteLabelsLayer)) {
                this.siteLabelsLayer.addTo(this.map);
            }
        } else {
            if (this.map.hasLayer(this.siteLabelsLayer)) {
                this.map.removeLayer(this.siteLabelsLayer);
            }
        }
    }

    setView(lat, lng) {
        this.map.setView([lat, lng], 15);
    }

    getColor(val, metric = 'level') {
        if (val === undefined) return '#888';
        // Removed isNaN(val) check because CellID is a string "RNC/CID" and isNaN returns true!

        if (window.getThresholdKey && window.themeConfig) {
            const rangeKey = window.getThresholdKey(metric);
            if (rangeKey) {
                const thresholds = window.themeConfig.thresholds[rangeKey];
                if (thresholds) {
                    for (const t of thresholds) {
                        // Check Min
                        if (t.min !== undefined && val <= t.min) continue;
                        // Check Max
                        if (t.max !== undefined && val > t.max) continue;

                        // If we are here, it matches
                        return t.color;
                    }
                    // Fallback if no match found (should be caught by last rule usually)
                    return '#888';
                }
            }
        }

        // Default / Frequency / Count
        // Use discrete coloring for IDs
        if (['cellId', 'pci', 'sc', 'lac', 'serving_cell_name'].includes(metric)) {
            if (metric === 'cellId' || metric === 'cid') {
                // ALWAYS use discrete coloring for Cell ID metric
                // This prevents falling back to "Tech Coloring" (Grey) when siteSettings is unset
                return this.getDiscreteColor(val);
            }
            return this.getDiscreteColor(val);
        }

        return '#3b82f6';
    }

    getDiscreteColor(val) {
        if (val === undefined || val === null || val === '' || val === 'N/A') return '#ff0000'; // RED for Invalid (Debug)

        // Check for Custom Overrides first
        const sVal = String(val);
        if (this.customDiscreteColors && this.customDiscreteColors[sVal]) {
            return this.customDiscreteColors[sVal];
        }

        // Normalize: Remove whitespace to match Index keys
        const str = sVal.replace(/\s/g, '');

        // Custom 12-color palette from user image
        const palette = [
            '#FF0000', // red
            '#0000FF', // blue
            '#00A300', // green
            '#FFFF00', // yellow
            '#FF8C00', // orange
            '#FF1493', // pink
            '#FFFFFF', // white
            '#808080', // gray
            '#FF00FF', // magenta
            '#6A0DAD', // purple
            '#000000', // black
            '#8B4513'  // brown
        ];

        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }

        // Map hash to palette index
        const index = Math.abs(hash) % palette.length;
        return palette[index];
    }

    resolveServingName(p) {
        if (!this.siteData) return null;
        const getName = (s) => s.cellName || s.name || s.siteName;

        const pci = p.sc;
        const lac = p.lac || (p.parsed && p.parsed.serving ? p.parsed.serving.lac : null);
        const freq = p.freq || (p.parsed && p.parsed.serving ? p.parsed.serving.freq : null);
        const cellId = p.cellId;

        // 1. User Rule: Strict RF Params (SC + LAC + Freq)
        if (pci && lac && freq) {
            const s = this.siteData.find(x => {
                const pciMatch = (x.pci == pci || x.sc == pci);
                const lacMatch = (x.lac == lac);
                const freqMatch = (x.freq == freq || Math.abs(x.freq - freq) < 1);
                return pciMatch && lacMatch && freqMatch;
            });
            if (s) return getName(s);
        }

        // 2. CellID + LAC
        if (cellId && lac) {
            const s = this.siteData.find(x => x.cellId == cellId && x.lac == lac);
            if (s) return getName(s);
        }

        // 3. CellID Only
        if (cellId) {
            const s = this.siteData.find(x => x.cellId == cellId);
            if (s) return getName(s);
        }

        return null;
    }

    addLogLayer(id, points, metric = 'level') {
        // Create a new layer group for this log
        const layerGroup = L.layerGroup();

        if (!points || points.length === 0) {
            console.warn("[MapRenderer] addLogLayer: No points to render.");
            return;
        }

        let validCount = 0;
        let naCount = 0;
        let firstValid = null;

        points.forEach((p, idx) => {
            let val = p[metric];
            // Normalize CellID for check
            if (metric === 'cellId' || metric === 'cid') {
                // SMART COLORING: If metric is 'cellId' (default identity), try to use the Smart Resolved ID
                // This covers cases where Log has Stale/Missing ID but 'p.sc' + 'p.freq' allows us to find the real Cell ID.
                if (metric === 'cellId' && window.resolveSmartSite) {
                    const resolved = window.resolveSmartSite(p);
                    if (resolved && resolved.id) {
                        val = resolved.id;
                    } else if (p.rnc !== undefined && p.rnc !== null && p.cid !== undefined && p.cid !== null) {
                        // Fallback to Raw RNC/CID if Smart Resolve failed
                        val = `${p.rnc}/${p.cid}`;
                    }
                } else if (p.rnc !== undefined && p.rnc !== null && p.cid !== undefined && p.cid !== null) {
                    val = `${p.rnc}/${p.cid}`;
                }
            }

            if (val === undefined || val === null || val === 'N/A' || val === '') {
                naCount++;
            } else {
                validCount++;
                if (!firstValid) firstValid = { idx, val, p };
            }
        });

        if (!firstValid) {
            console.warn("[MapRenderer] NO VALID POINTS FOUND for this metric!");
        }


        // CHUNKED RENDERING: Process points in batches to avoid freezing UI
        const CHUNK_SIZE = 1000;
        const totalPoints = points.length;
        let pIdx = 0;
        const validLocations = [];
        const idsCollection = new Map(); // Accumulate IDs for Legend here
        let totalValidsForMetric = 0;

        const processChunk = () => {
            const end = Math.min(pIdx + CHUNK_SIZE, totalPoints);
            for (let i = pIdx; i < end; i++) {
                const p = points[i];
                let val = p[metric];

                // Special handling for Serving Cell Name
                if (metric === 'serving_cell_name') {
                    val = this.resolveServingName(p) || 'Unknown';
                }

                // Normalize CellID for color matching with Sites
                if (metric === 'cellId' || metric === 'cid') {
                    // Smart Resolve logic already likely applied in First Pass? 
                    // No, "First Pass" above only Calc'd stats (validCount).
                    // We need to re-apply Smart Logic here or cache it.
                    // Caching would be better but let's re-run (it's O(1) now).

                    if (window.resolveSmartSite) {
                        const resolved = window.resolveSmartSite(p);
                        if (resolved && resolved.id) {
                            val = resolved.id;
                        } else if (p.rnc !== undefined && p.cid !== undefined) {
                            val = `${p.rnc}/${p.cid}`;
                        }
                    } else if (p.rnc !== undefined && p.cid !== undefined) {
                        val = `${p.rnc}/${p.cid}`;
                    }

                    if (pIdx === 0 && i < 3) {
                        console.log(`[MapRenderer] Point ${i} Debug:`, {
                            hasResolve: !!window.resolveSmartSite,
                            resolved: window.resolveSmartSite ? window.resolveSmartSite(p) : 'N/A',
                            pRnc: p.rnc, pCid: p.cid, pCellId: p.cellId,
                            FINAL_VAL: val
                        });
                    }

                    // Collect ID for Legend (Async Accumulation with Counts)
                    if (val !== undefined && val !== null) {
                        const sVal = String(val);
                        idsCollection.set(sVal, (idsCollection.get(sVal) || 0) + 1);
                        totalValidsForMetric++;
                    }
                }

                // Special Metric Handling
                if (metric === 'rscp_not_combined' || metric === 'rscp') {
                    if (val === undefined) val = p.level;
                    if (val === undefined) val = p.rscp;
                    if (val === undefined && p.parsed && p.parsed.serving) val = p.parsed.serving.level;
                }
                if (metric.startsWith('active_set_')) {
                    const sub = metric.replace('active_set_', '').toLowerCase();
                    val = p[sub];
                }
                if (val === undefined && p.parsed && p.parsed.serving) val = p.parsed.serving[metric];

                const color = this.getColor(val, metric);

                // Collect Stats for Thematic Metrics (RSRP, RSRQ, etc.)
                // If it's not cellId/cid, it might be a thematic metric mapping to level or quality
                if (metric !== 'cellId' && metric !== 'cid' && window.getThresholdKey) {
                    const rangeKey = window.getThresholdKey(metric);
                    if (rangeKey && window.themeConfig) {
                        const thresholds = window.themeConfig.thresholds[rangeKey];
                        if (thresholds && val !== undefined && val !== null) {
                            // Find matching label
                            let matched = false;
                            for (const t of thresholds) {
                                if (t.min !== undefined && val <= t.min) continue;
                                if (t.max !== undefined && val > t.max) continue;
                                idsCollection.set(t.label, (idsCollection.get(t.label) || 0) + 1);
                                matched = true;
                                break;
                            }
                            if (matched) totalValidsForMetric++;
                        }
                    }
                }

                if (p.lat !== undefined && p.lat !== null && p.lng !== undefined && p.lng !== null) {
                    validLocations.push([p.lat, p.lng]);

                    const marker = L.circleMarker([p.lat, p.lng], {
                        radius: 5,
                        fillColor: color,
                        color: "#000",
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(layerGroup);

                    marker.on('click', () => {
                        window.dispatchEvent(new CustomEvent('map-point-clicked', {
                            detail: { logId: id, point: p }
                        }));
                    });
                }
            }

            pIdx = end;
            if (pIdx < totalPoints) {
                // Yield to main thread
                setTimeout(processChunk, 0);
            } else {
                // Done
                if (validLocations.length > 0) {
                    this.map.fitBounds(validLocations);
                }

                // Finalize Legend IDs if applicable
                if (metric === 'cellId' || metric === 'cid') {
                    this.activeMetricIds = Array.from(idsCollection.keys()).sort();
                    this.activeMetricStats = idsCollection; // Map of ID -> Count
                    this.totalActiveSamples = totalValidsForMetric;
                    // Re-render sites to match colors if needed
                    this.renderSites(false);
                } else {
                    // For thematic metrics (level, quality), we also expose stats
                    this.activeMetricStats = idsCollection; // Map of Label -> Count
                    this.totalActiveSamples = totalValidsForMetric;
                    this.activeMetricIds = null; // Signal this is thematic
                }

                // Signal that rendering and ID collection is complete
                window.dispatchEvent(new CustomEvent('layer-metric-ready', { detail: { metric } }));
            }
        };

        this.logLayers[id] = layerGroup;
        layerGroup.addTo(this.map);

        // Start Processing
        processChunk();
    }

    highlightMarker(logId, index) {
        const layerGroup = this.logLayers[logId];
        if (!layerGroup) return;

        const layers = layerGroup.getLayers();
        if (layers[index]) {
            const marker = layers[index];
            const latLng = marker.getLatLng();

            // 1. Remove previous highlight
            if (this.currentHighlight) {
                this.map.removeLayer(this.currentHighlight);
            }

            // 2. Create pulsing highlight ring
            this.currentHighlight = L.circleMarker(latLng, {
                radius: 10,
                fill: false,
                color: '#ef4444', // Red Pulse
                weight: 3,
                className: 'pulsing-highlight',
                interactive: false // Don't block clicks
            }).addTo(this.map);

            // 3. Open Popup
            marker.openPopup();

            // 4. Ensure view contains it 
            if (!this.map.getBounds().contains(latLng)) {
                this.map.panTo(latLng);
            }
        }
    }

    updateLayerMetric(id, points, metric) {
        console.log(`[MapRenderer] updateLayerMetric: id=${id}, points=${points ? points.length : 0}, metric=${metric}`);

        // SYNC SITES SETUP
        if (metric === 'cellId' || metric === 'cid') {
            // DEFER ID Collection to addLogLayer (Chunked) to avoid freeze
            // this.activeMetricIds will be updated when rendering finishes.

            // Force Identity Mode
            if (!this.siteSettings) this.siteSettings = {};
            this.siteSettings.colorBy = 'identity';

            // Render Sites with Highlights (Initial pass, update happens after async processing)
            this.renderSites(false);
        } else {
            this.activeMetricIds = null;
        }

        this.removeLogLayer(id);
        this.addLogLayer(id, points, metric);
    }

    removeLogLayer(id) {
        if (this.logLayers[id]) {
            this.map.removeLayer(this.logLayers[id]);
            delete this.logLayers[id];
        }
        this.removeEventsLayer(id);
    }

    addEventsLayer(id, points) {
        if (!this.eventLayers) this.eventLayers = {};
        if (this.eventLayers[id]) this.map.removeLayer(this.eventLayers[id]);

        const layerGroup = L.layerGroup();

        points.forEach(p => {
            if (!p.event) return;
            // Aggressive Filter for Testing
            const evt = p.event.toLowerCase();
            if (evt.includes('disconnect') || evt.includes('release') || evt.includes('end') || evt.includes('normal')) return;

            // Skip points with invalid valid coordinates to prevent Leaflet crash
            if (p.lat === undefined || p.lat === null || p.lng === undefined || p.lng === null || isNaN(p.lat) || isNaN(p.lng)) return;

            let color = '#000';


            let fillColor = '#fff';
            let radius = 6;
            let label = p.event;

            switch (p.event) {
                case 'HO Fail':
                    color = '#f97316'; // Orange
                    fillColor = '#f97316';
                    radius = 7;
                    break;
                case 'Call Drop':
                    color = '#ef4444'; // Red
                    fillColor = '#ef4444';
                    radius = 8;
                    break;
                case 'Call Fail':
                    color = '#991b1b'; // Dark Red
                    fillColor = '#991b1b';
                    radius = 8;
                    break;
                case 'Call Disconnect':
                    color = '#6b7280'; // Grey
                    fillColor = '#6b7280';
                    radius = 5;
                    break;
            }

            const marker = L.circleMarker([p.lat, p.lng], {
                radius: radius,
                color: '#fff', // White border for contrast
                weight: 2,
                fillColor: fillColor,
                fillOpacity: 1,
                className: 'event-marker'
            }).bindTooltip(label, {
                permanent: false,
                direction: 'top',
                offset: [0, -5]
            });

            // Add popup with details
            const latStr = (p.lat !== undefined && p.lat !== null) ? p.lat.toFixed(5) : 'N/A';
            const lngStr = (p.lng !== undefined && p.lng !== null) ? p.lng.toFixed(5) : 'N/A';

            marker.bindPopup(`
                <b>${label}</b><br>
                Time: ${p.time}<br>
                Cause: ${p.message}<br>
                lat: ${latStr}, lng: ${lngStr}
             `);

            layerGroup.addLayer(marker);
        });

        layerGroup.addTo(this.map);
        this.eventLayers[id] = layerGroup;
    }

    removeEventsLayer(id) {
        if (this.eventLayers && this.eventLayers[id]) {
            this.map.removeLayer(this.eventLayers[id]);
            delete this.eventLayers[id];
        }
    }

    addSiteLayer(sectors) {
        this.siteData = sectors; // Store original data

        // Build Index for Performance
        this.siteIndex = {
            byId: new Map(),
            bySc: new Map()
        };

        sectors.forEach(s => {
            // Index by CellID (String normalized)
            if (s.cellId) {
                // Normalize: Remove whitespace to match app.js 'norm' logic
                const normId = String(s.cellId).replace(/\s/g, '');
                this.siteIndex.byId.set(normId, s);

                // Also index by RNC/CID if available, just in case
                if (s.rnc && s.cid) {
                    const rncCid = `${s.rnc}/${s.cid}`.replace(/\s/g, '');
                    this.siteIndex.byId.set(rncCid, s);
                }
            }

            // Index by SC (PCI) for Fuzzy Freq Matching
            const sc = s.sc || s.pci;
            if (sc !== undefined) {
                const key = String(sc);
                if (!this.siteIndex.bySc.has(key)) {
                    this.siteIndex.bySc.set(key, []);
                }
                this.siteIndex.bySc.get(key).push(s);
            }
        });

        this.renderSites(true); // Fit bounds on initial load
    }

    updateSiteSettings(settings) {
        this.siteSettings = { ...this.siteSettings, ...settings };
        if (this.siteData) {
            this.renderSites(false); // Do NOT fit bounds on settings update
        }
    }

    getSiteColor(s) {
        if (this.siteSettings && this.siteSettings.colorBy === 'identity') {
            let idStr = s.cellId;
            if (s.rnc && s.cid) idStr = `${s.rnc}/${s.cid}`;
            return this.getDiscreteColor(idStr);
        }

        const tech = (s.tech || '').toLowerCase();
        if (tech.includes('5g') || tech.includes('nr')) return '#8b5cf6'; // Purple
        if (tech.includes('4g') || tech.includes('lte')) return '#ef4444'; // Red
        if (tech.includes('3g') || tech.includes('umts') || tech.includes('wcdma')) return '#f59e0b'; // Amber
        if (tech.includes('2g') || tech.includes('gsm')) return '#3b82f6'; // Blue
        return '#6b7280'; // Gray
    }

    renderSites(fitBounds = false, activeCellIds = null) {
        if (!activeCellIds && this.activeMetricIds) {
            activeCellIds = this.activeMetricIds;
        }
        if (this.sitesLayer) {
            this.map.removeLayer(this.sitesLayer);
        }

        if (!this.siteData || this.siteData.length === 0) return;

        this.sitesLayer = L.layerGroup();

        // Clear Labels
        if (this.siteLabelsLayer) {
            this.siteLabelsLayer.clearLayers();
        }

        const settings = this.siteSettings || {};
        const range = parseInt(settings.range) || 200;
        const opacity = parseFloat(settings.opacity) || 0.6;
        const beam = parseInt(settings.beamwidth) || 60;
        const overrideColor = settings.useOverride ? settings.color : null;

        const renderedSiteLabels = new Set();
        this.sitePolygons = {};

        this.siteData.forEach(s => {
            if (s.lat === undefined || s.lng === undefined || isNaN(s.lat) || isNaN(s.lng)) return;

            // COLOR LOGIC FOR SELECTIVE HIGHLIGHT
            let color;
            let finalOpacity = opacity;
            let finalFillOpacity = opacity * 0.5;

            if (activeCellIds) {
                // HIGHLIGHT MODE: Default is dim
                color = '#444';
                finalOpacity = 0.2;
                finalFillOpacity = 0.05;

                let idStr = s.cellId;
                if (s.rnc && s.cid) idStr = `${s.rnc}/${s.cid}`;

                if (activeCellIds.includes(String(idStr)) || activeCellIds.includes(String(s.cellId))) {
                    // Match! Use Identity Color
                    color = this.getDiscreteColor(idStr);
                    finalOpacity = 1;
                    finalFillOpacity = 0.6;
                }
            } else {
                // STANDARD MODE
                color = overrideColor || this.getSiteColor(s);
            }

            // Calculations
            const azimuth = s.azimuth || 0;
            const center = [s.lat, s.lng];

            const getPoint = (lat, lng, bearing, dist) => {
                const rad = Math.PI / 180;
                const latRad = lat * rad;
                const bearRad = bearing * rad;
                const dy = Math.cos(bearRad) * dist;
                const dx = Math.sin(bearRad) * dist;
                const dLat = dy / 111111;
                const dLng = dx / (111111 * Math.cos(latRad));
                return [lat + dLat, lng + dLng];
            };

            const p1 = getPoint(s.lat, s.lng, azimuth - beam / 2, range);
            const p2 = getPoint(s.lat, s.lng, azimuth + beam / 2, range);

            const polygon = L.polygon([center, p1, p2], {
                color: '#333',
                weight: 1,
                fillColor: color,
                fillOpacity: finalFillOpacity,
                opacity: finalOpacity
            }).addTo(this.sitesLayer);

            if (s.cellId) {
                this.sitePolygons[s.cellId] = polygon;
            }

            // Labels
            if (settings.showSiteNames) {
                const siteName = s.siteName || s.name;
                if (siteName && !renderedSiteLabels.has(siteName)) {
                    renderedSiteLabels.add(siteName);
                    L.marker(center, { icon: L.divIcon({ className: 'site-label', html: `<div style="color:#fff; font-size:10px; text-shadow:0 0 2px #000; white-space:nowrap;">${siteName}</div>`, iconAnchor: [20, 10] }), interactive: false }).addTo(this.siteLabelsLayer);
                }
            }
            if (settings.showCellNames) {
                const tipMid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
                L.marker(tipMid, { icon: L.divIcon({ className: 'cell-label', html: `<div style="color:#ddd; font-size:9px; text-shadow:0 0 2px #000; white-space:nowrap;">${s.cellId || ''}</div>`, iconAnchor: [10, 0] }), interactive: false }).addTo(this.siteLabelsLayer);
            }

            // Popup
            const content = `
                <div style="font-family: sans-serif; font-size: 13px;">
                    <strong>${s.name || 'Unknown Site'}</strong><br>
                    Cell: ${s.cellId || '-'}<br>
                    Azimuth: ${azimuth}°<br>
                    Tech: ${s.tech || '-'}<br>
                    <span style="font-size:10px; color:#888;">(RNC/CID: ${s.rnc}/${s.cid})</span>
                </div>
            `;
            polygon.bindPopup(content);
            polygon.on('click', () => { window.dispatchEvent(new CustomEvent('site-sector-clicked', { detail: { cellId: s.cellId, sc: s.sc || s.pci, lac: s.lac, freq: s.freq, lat: s.lat, lng: s.lng, azimuth: azimuth } })); });
        });

        this.sitesLayer.addTo(this.map);
        this.updateLabelVisibility();

        if (fitBounds && this.siteData.length > 0) {
            const bounds = L.latLngBounds(this.siteData.map(s => [s.lat, s.lng]));
            this.map.fitBounds(bounds.pad(0.1));
        }
    }

    highlightCell(cellId) {
        if (!cellId || !this.sitePolygons) return;

        // Reset previous highlight
        if (this.currentHighlight) {
            const { poly, originalStyle } = this.currentHighlight;
            poly.setStyle(originalStyle);
            this.currentHighlight = null;
        }

        const polygon = this.sitePolygons[cellId];
        if (polygon) {
            // Save original style (approximate or just hardcoded default if easier)
            // But checking current options is safer
            const originalStyle = {
                color: polygon.options.color,
                weight: polygon.options.weight,
                fillColor: polygon.options.fillColor,
                fillOpacity: polygon.options.fillOpacity
            };

            // Apply Highlight
            polygon.setStyle({
                color: '#ffff00', // Bright Yellow Border
                weight: 4,
                fillColor: '#ffff00', // Yellow Fill
                fillOpacity: 0.6
            });
            polygon.bringToFront();

            // Pan to it
            if (polygon.getBounds) {
                this.map.panTo(polygon.getBounds().getCenter());
            }

            this.currentHighlight = { poly: polygon, originalStyle: originalStyle };
        } else {
            console.warn(`Cell ID ${cellId} not found in site polygons.`);
        }
    }

    setCustomColor(id, color) {
        this.customDiscreteColors[id] = color;
        // Optimization: We could surgically update just those points/polygons, 
        // but re-rendering is much safer to ensure consistency with current metric.
        // Firing global events to trigger re-rendering of active log/theme
        window.dispatchEvent(new CustomEvent('metric-color-changed', { detail: { id, color } }));
    }

    drawConnections(startPt, targets) {
        // Clear previous connections
        this.connectionsLayer.clearLayers();
        if (!startPt || !targets || targets.length === 0) return;

        targets.forEach(t => {
            if (t.lat === undefined || t.lng === undefined) return;

            let destLat = t.lat;
            let destLng = t.lng;

            // Tip Calculation logic
            if (t.cellId && this.sitePolygons[t.cellId]) {
                const poly = this.sitePolygons[t.cellId];
                // Polygon structure: [center, p1, p2]
                // Leaflet polygons often return nested arrays: [[center, p1, p2]]
                const latLngs = poly.getLatLngs();
                const points = Array.isArray(latLngs[0]) ? latLngs[0] : latLngs;

                if (points.length >= 3) {
                    const p1 = points[1];
                    const p2 = points[2];
                    destLat = (p1.lat + p2.lat) / 2;
                    destLng = (p1.lng + p2.lng) / 2;
                }
            }

            L.polyline([[startPt.lat, startPt.lng], [destLat, destLng]], {
                color: t.color,
                weight: t.weight || 3, // Default thicker (was 2)
                opacity: 1.0,          // Fully opaque (was 0.8)
                dashArray: '10, 5'     // Longer dashes (was '5, 5')
            }).addTo(this.connectionsLayer);
        });
    }

    clearConnections() {
        this.connectionsLayer.clearLayers();
    }



}
