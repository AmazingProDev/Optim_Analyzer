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
        osmLayer.addTo(this.map);

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
        if (val === undefined || val === null || val === 'N/A' || val === '') return '#888';

        if (window.getThresholdKey && window.themeConfig) {
            const rangeKey = window.getThresholdKey(metric);
            if (rangeKey) {
                const thresholds = window.themeConfig.thresholds[rangeKey];
                if (thresholds) {
                    for (const t of thresholds) {
                        if (t.min !== undefined && val <= t.min) continue;
                        if (t.max !== undefined && val > t.max) continue;
                        return t.color;
                    }
                    return '#888';
                }
            }
        }

        if (['cellId', 'cid', 'pci', 'sc', 'lac', 'serving_cell_name'].includes(metric)) {
            return this.getDiscreteColor(val);
        }

        return '#3b82f6';
    }

    getMetricValue(p, metric) {
        if (!p) return undefined;
        let val = p[metric];

        // 1. Serving Cell Name Resolution
        if (metric === 'serving_cell_name') {
            return this.resolveServingName(p) || 'Unknown';
        }

        // 2. Identity Resolution (Smart ID)
        if (metric === 'cellId' || metric === 'cid') {
            if (window.resolveSmartSite) {
                const resolved = window.resolveSmartSite(p);
                if (resolved && resolved.id) return resolved.id;
            }
            if (p.rnc !== undefined && p.cid !== undefined) {
                return `${p.rnc}/${p.cid}`;
            }
            return p.cellId || p.cid;
        }

        // 3. Radio Metrics Fallbacks
        if (metric === 'rscp_not_combined' || metric === 'rscp') {
            if (val === undefined) val = p.level || p.rscp;
            if (val === undefined && p.parsed && p.parsed.serving) val = p.parsed.serving.level || p.parsed.serving.rscp;
        }
        if (metric.startsWith('active_set_')) {
            const sub = metric.replace('active_set_', '').toLowerCase();
            val = p[sub];
        }

        // 4. Serving Struct Fallback
        if (val === undefined && p.parsed && p.parsed.serving) {
            val = p.parsed.serving[metric];
        }

        return val;
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

        // Robust 53-bit hash for better dispersion of similar strings (like RNC/CID)
        const cyrb53 = (str, seed = 0) => {
            let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
            for (let i = 0, ch; i < str.length; i++) {
                ch = str.charCodeAt(i);
                h1 = Math.imul(h1 ^ ch, 2654435761);
                h2 = Math.imul(h2 ^ ch, 1597334677);
            }
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
            h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
            h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
            return 4294967296 * (2097151 & h2) + (h1 >>> 0);
        };

        const hash = cyrb53(str);
        const index = hash % palette.length;
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
        this.activeLogId = id;
        this.activeMetric = metric;
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
            let val = this.getMetricValue(p, metric);
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
                const val = this.getMetricValue(p, metric);

                // Handle Identity Metrics Collection for Legend
                if (metric === 'cellId' || metric === 'cid') {
                    if (val !== undefined && val !== null) {
                        const sVal = String(val);
                        idsCollection.set(sVal, (idsCollection.get(sVal) || 0) + 1);
                        totalValidsForMetric++;
                    }
                }


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

                const color = this.getColor(val, metric);

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
            bySc: new Map(),
            all: sectors
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
        const range = parseInt(settings.range) || 100;
        const opacity = parseFloat(settings.opacity) || 0.6;
        const beam = parseInt(settings.beamwidth) || 35;
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
            polygon.on('click', () => {
                window.dispatchEvent(new CustomEvent('site-sector-clicked', {
                    detail: {
                        cellId: s.cellId,
                        sc: s.sc || s.pci,
                        lac: s.lac,
                        freq: s.freq,
                        lat: s.lat,
                        lng: s.lng,
                        azimuth: azimuth,
                        rnc: s.rnc,
                        cid: s.cid,
                        range: range,
                        beamwidth: beam
                    }
                }));
            });
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


    exportToKML(logId, logPoints, metricName) {
        if (!logPoints || logPoints.length === 0) return null;

        const isDiscrete = (metricName === 'cellId' || metricName === 'cid');

        let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${metricName.toUpperCase()} Analysis - ${new Date().toLocaleTimeString()}</name>
    <open>1</open>
`;

        // Helper to convert #RRGGBB to aabbggrr
        const hexToKmlColor = (hex) => {
            if (!hex || hex[0] !== '#') return 'ffcccccc';
            const r = hex.substring(1, 3);
            const g = hex.substring(3, 5);
            const b = hex.substring(5, 7);
            return 'ff' + b + g + r; // Fully opaque
        };

        // Collect Unique Styles
        const styles = new Set();
        // Grouping Map: Label -> Array of Placemarks
        const groups = new Map();

        const settings = this.siteSettings || {};
        const range = parseInt(settings.range) || 100;
        const rad = Math.PI / 180;

        // Determine Thresholds if applicable
        let thresholds = null;
        if (window.getThresholdKey && window.themeConfig) {
            const rangeKey = window.getThresholdKey(metricName);
            if (rangeKey && window.themeConfig.thresholds[rangeKey]) {
                thresholds = window.themeConfig.thresholds[rangeKey];
            }
        }

        logPoints.forEach((p, idx) => {
            if (p.lat === undefined || p.lng === undefined) return;

            const val = this.getMetricValue(p, metricName);
            const color = this.getColor(val, metricName);

            const styleId = 's_' + color.replace('#', '');
            styles.add({ id: styleId, color: hexToKmlColor(color) });

            // Detailed Description Generation
            const safeVal = (v) => (v !== undefined && v !== '-' && !isNaN(v) ? Number(v).toFixed(1) : '-');
            const formatId = (id) => {
                if (!id || id === 'N/A') return id;
                const strId = String(id);
                if (strId.includes('/')) return id;
                const num = Number(strId.replace(/[^\d]/g, ''));
                if (!isNaN(num) && num > 65535) return `${num >> 16}/${num & 0xFFFF}`;
                return id;
            };

            const s = (p.parsed && p.parsed.serving) ? p.parsed.serving : {};
            const sFreq = s.freq;
            const sLac = s.lac;

            const servingRes = window.resolveSmartSite ? window.resolveSmartSite(p) : { name: 'Unknown', id: p.cellId };
            const servingData = {
                type: 'Serving',
                name: servingRes.name || 'Unknown',
                cellId: servingRes.id || p.cellId,
                displayId: formatId(servingRes.id || p.cellId),
                sc: p.sc,
                rscp: p.rscp !== undefined ? p.rscp : (p.level !== undefined ? p.level : (s.level !== undefined ? s.level : '-')),
                ecno: p.ecno !== undefined ? p.ecno : (s.ecno !== undefined ? s.ecno : '-'),
                freq: sFreq || '-'
            };

            // Table Rows Construction (Simplified for brevity as string interpolation)
            // Note: Keeping the rich description logic is good, but for the task "Grouping", the key is the folder logic below.
            // I will retain the detailed description logic.

            const resolveNeighbor = (pci, cellId, freq) => {
                if (!window.resolveSmartSite) return { name: 'Unknown', id: cellId || pci };
                return window.resolveSmartSite({
                    sc: pci, cellId: cellId, lac: sLac, freq: freq || sFreq, lat: p.lat, lng: p.lng
                });
            };

            let activeRows = [];
            // ... (Logic for neighbors same as previous) ...
            if (p.a2_sc !== undefined && p.a2_sc !== null) {
                const a2Res = resolveNeighbor(p.a2_sc, null, sFreq);
                const nA2 = p.parsed && p.parsed.neighbors ? p.parsed.neighbors.find(n => n.pci === p.a2_sc) : null;
                activeRows.push({ type: '2nd Active', name: a2Res.name, cellId: a2Res.id, sc: p.a2_sc, rscp: p.a2_rscp || (nA2 ? nA2.rscp : '-'), ecno: nA2 ? nA2.ecno : '-', freq: sFreq || '-' });
            }
            if (p.a3_sc !== undefined && p.a3_sc !== null) {
                const a3Res = resolveNeighbor(p.a3_sc, null, sFreq);
                const nA3 = p.parsed && p.parsed.neighbors ? p.parsed.neighbors.find(n => n.pci === p.a3_sc) : null;
                activeRows.push({ type: '3rd Active', name: a3Res.name, cellId: a3Res.id, sc: p.a3_sc, rscp: p.a3_rscp || (nA3 ? nA3.rscp : '-'), ecno: nA3 ? nA3.ecno : '-', freq: sFreq || '-' });
            }
            // Detected/Neighbor rows
            let otherRows = [];
            if (p.parsed && p.parsed.neighbors) {
                const activeSCs = [p.sc, p.a2_sc, p.a3_sc].filter(x => x !== undefined && x !== null);
                p.parsed.neighbors.forEach((n, idx) => {
                    const nRes = resolveNeighbor(n.pci, n.cellId, n.freq);
                    const type = n.type === 'detected' ? `D${n.idx || (idx + 1)}` : `N${idx + 1}`;
                    if (n.type === 'detected' || !activeSCs.includes(n.pci)) {
                        otherRows.push({ type: type, name: nRes.name, cellId: nRes.id, sc: n.pci, rscp: n.rscp, ecno: n.ecno, freq: n.freq });
                    }
                });
            }

            const renderRow = (d, bold = false) => `
                <tr style="border-bottom:1px solid #ccc; ${bold ? 'font-weight:bold;' : ''}">
                    <td>${d.type}</td><td>${d.name} (${formatId(d.cellId || '-')})</td><td align="right">${d.sc || ''}</td><td align="right">${safeVal(d.rscp)}</td><td align="right">${safeVal(d.ecno)}</td><td align="right">${d.freq}</td>
                </tr>`;

            const rowsHtml = renderRow(servingData, true) + activeRows.map(r => renderRow(r)).join('') + otherRows.map(r => renderRow(r)).join('');

            const desc = `
                <div style="font-family:sans-serif; width:400px; font-size:12px;">
                    <div style="font-weight:bold; font-size:14px; color:#22c55e;">${servingData.name}</div>
                    <div style="color:#555;">Time: ${p.time || 'N/A'} (Lat:${Number(p.lat).toFixed(5)}, Lng:${Number(p.lng).toFixed(5)})</div>
                    <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:5px;">
                        <tr style="background:#f3f4f6;"><th align="left">Type</th><th align="left">Cell</th><th>SC</th><th>RSCP</th><th>EcNo</th><th>Freq</th></tr>
                        ${rowsHtml}
                    </table>
                </div>`;

            // Geometry (Spider Line)
            let geometry = `<Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>`;
            if (window.resolveSmartSite) {
                const res = window.resolveSmartSite(p);
                if (res && res.lat && res.lng && res.site) {
                    const tipLat = res.lat, tipLng = res.lng; // Simplified for brevity, assume direct line logic matches
                    geometry = `<MultiGeometry><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point><LineString><coordinates>${p.lng},${p.lat},0 ${tipLng},${tipLat},0</coordinates></LineString></MultiGeometry>`;
                }
            }

            // DETERMINE GROUP FOLDER
            let groupName = 'Others';
            if (thresholds && val !== undefined && val !== null && val !== 'N/A') {
                for (const t of thresholds) {
                    if ((t.min === undefined || val > t.min) && (t.max === undefined || val <= t.max)) {
                        groupName = t.label;
                        break;
                    }
                }
            } else if (val !== undefined && val !== null && val !== '') {
                // Discrete grouping (e.g. SC, PCI)
                groupName = String(val);
            }

            if (!groups.has(groupName)) groups.set(groupName, []);
            groups.get(groupName).push(`    <Placemark>
      <name></name>
      <description><![CDATA[${desc}]]></description>
      <styleUrl>#sm_${styleId}</styleUrl>
${geometry}
    </Placemark>`);
        });

        // Add Style Definitions
        styles.forEach(s => {
            // ... (Style definitions same as before) ...
            kml += `    <Style id="${s.id}_normal">
      <IconStyle><color>${s.color}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon></IconStyle>
      <LabelStyle><scale>0</scale></LabelStyle><LineStyle><color>${s.color}</color><width>0</width></LineStyle>
    </Style>
    <Style id="${s.id}_highlight">
      <IconStyle><color>${s.color}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon></IconStyle>
      <LabelStyle><scale>0</scale></LabelStyle><LineStyle><color>${s.color}</color><width>4</width></LineStyle>
    </Style>
    <StyleMap id="sm_${s.id}">
      <Pair><key>normal</key><styleUrl>#${s.id}_normal</styleUrl></Pair>
      <Pair><key>highlight</key><styleUrl>#${s.id}_highlight</styleUrl></Pair>
    </StyleMap>\n`;
        });

        // Add Folders
        // Sort keys for better organization (optional but nice)
        const sortedKeys = Array.from(groups.keys()).sort();

        // If using thresholds, we might want to sort by strict order (Excellent -> Bad)
        // But map iteration order + string sort is better than nothing.
        // If these are labels like "Excellent (> -70)", alphabetical might be weird ("Bad" comes before "Excellent"?)
        // Let's rely on insertion order if possible, or leave basic sort.
        // Actually, for thresholds, iterating the 'thresholds' array to pick keys would be best order.

        let orderedKeys = sortedKeys;
        if (thresholds) {
            const tLabels = thresholds.map(t => t.label);
            const others = sortedKeys.filter(k => !tLabels.includes(k));
            orderedKeys = [...tLabels.filter(k => groups.has(k)), ...others];
        }

        // XML Escaping Helper
        const escapeXml = (unsafe) => {
            if (typeof unsafe !== 'string') return unsafe;
            return unsafe.replace(/[<>&'"]/g, (c) => {
                switch (c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '&': return '&amp;';
                    case '\'': return '&apos;';
                    case '"': return '&quot;';
                }
            });
        };

        orderedKeys.forEach(key => {
            const content = groups.get(key);
            if (content && content.length > 0) {
                kml += `    <Folder>\n      <name>${escapeXml(key)}</name>\n`;
                kml += content.join('\n');
                kml += `\n    </Folder>\n`;
            }
        });

        kml += '\n  </Document>\n</kml>';

        return kml;
    }
    // Unified Export: Points + Relevant Sites
    exportUnifiedKML(logId, logPoints, metricName) {
        if (!logPoints || logPoints.length === 0) return null;

        // 1. Generate Points Content (Folders + Styles)
        // We need to extract the "Inner" logic of exportToKML (styles, and folders)
        // Since we can't easily decompose the existing opaque string methods without refactoring, 
        // I will essentially merge the logic here for the unified view.

        // OR: Parse the outputs? No, regex is messy.
        // Best approach: Refactor exportToKML to be 'getPointsKMLParts' and 'getSitesKMLParts'.
        // But for minimal disturbance, I will implement a composed internal generator.

        const partsPoints = this._generatePointsKMLParts(logPoints, metricName);
        const partsSites = this._generateSitesKMLParts(logPoints); // Auto-filters to relevant

        // XML Escaping Helper
        const escapeXml = (unsafe) => {
            if (unsafe === undefined || unsafe === null) return '';
            const str = String(unsafe);
            return str.replace(/[<>&'"]/g, (c) => {
                switch (c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '&': return '&amp;';
                    case '\'': return '&apos;';
                    case '"': return '&quot;';
                }
            });
        };

        let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(metricName.toUpperCase())} Analysis (Unified) - ${escapeXml(new Date().toLocaleTimeString())}</name>
    <open>1</open>
`;

        // Merge Styles (Dedup by ID)
        // Both parts return a Set of style strings.
        const allStyles = new Map(); // id -> string definition

        partsPoints.styles.forEach(s => allStyles.set(s.id, s.xml));
        partsSites.styles.forEach(s => allStyles.set(s.id, s.xml)); // Sites might override if ID collision, but usually discrete colors match

        allStyles.forEach(xml => kml += xml);

        // Add Points Folders
        kml += partsPoints.folders;

        // Add Sites Folder
        if (partsSites.placemarks.length > 0) {
            kml += `    <Folder>\n      <name>Serving Sites</name>\n`;
            kml += partsSites.placemarks.join('\n');
            kml += `\n    </Folder>\n`;
        }

        kml += '\n  </Document>\n</kml>';
        return kml;
    }

    // internal helper for points refactored from exportToKML
    _generatePointsKMLParts(logPoints, metricName) {
        // ... (Logic from exportToKML but returning { styles: [{id, xml}], folders: string }) ...
        // COPYING LOGIC FROM exportToKML (Simplified for brevity in thought process, full in code)

        const settings = this.siteSettings || {};
        const range = parseInt(settings.range) || 100;
        const rad = Math.PI / 180;
        const groups = new Map();
        const styles = new Set();
        const styleDefs = [];

        const escapeXml = (unsafe) => {
            if (typeof unsafe !== 'string') return unsafe;
            return unsafe.replace(/[<>&'"]/g, (c) => {
                switch (c) {
                    case '<': return '&lt;'; case '>': return '&gt;'; case '&': return '&amp;'; case '\'': return '&apos;'; case '"': return '&quot;';
                }
            });
        };

        const hexToKmlColor = (hex) => {
            if (!hex || hex[0] !== '#') return 'ffcccccc';
            return 'ff' + hex.substring(5, 7) + hex.substring(3, 5) + hex.substring(1, 3);
        };

        let thresholds = null;
        if (window.getThresholdKey && window.themeConfig) {
            const rangeKey = window.getThresholdKey(metricName);
            if (rangeKey && window.themeConfig.thresholds[rangeKey]) thresholds = window.themeConfig.thresholds[rangeKey];
        }

        logPoints.forEach(p => {
            if (p.lat === undefined || p.lng === undefined) return;
            const val = this.getMetricValue(p, metricName);
            const color = this.getColor(val, metricName);
            const styleId = 's_' + color.replace('#', '');

            if (!styles.has(styleId)) {
                styles.add(styleId);
                const kColor = hexToKmlColor(color);
                styleDefs.push({
                    id: styleId, xml: `
    <Style id="${styleId}_normal"><IconStyle><color>${kColor}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon></IconStyle><LabelStyle><scale>0</scale></LabelStyle><LineStyle><color>${kColor}</color><width>0</width></LineStyle></Style>
    <Style id="${styleId}_highlight"><IconStyle><color>${kColor}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon></IconStyle><LabelStyle><scale>0</scale></LabelStyle><LineStyle><color>${kColor}</color><width>4</width></LineStyle></Style>
    <StyleMap id="sm_${styleId}"><Pair><key>normal</key><styleUrl>#${styleId}_normal</styleUrl></Pair><Pair><key>highlight</key><styleUrl>#${styleId}_highlight</styleUrl></Pair></StyleMap>\n`
                });
            }

            // Grouping Logic
            let groupName = 'Others';
            if (thresholds && val !== undefined && val !== null && val !== 'N/A') {
                for (const t of thresholds) {
                    if ((t.min === undefined || val > t.min) && (t.max === undefined || val <= t.max)) { groupName = t.label; break; }
                }
            } else if (val !== undefined && val !== null && val !== '') { groupName = String(val); }

            // Geometry logic
            let geometry = `<Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>`;
            if (window.resolveSmartSite) {
                const res = window.resolveSmartSite(p);
                if (res && res.lat && res.lng && res.site) {
                    // Spider Line (To Sector Tip)
                    const s = res.site;
                    const az = parseFloat(s.beam || s.azimuth || 0);
                    const aRad = az * rad;
                    // Calculate Tip Offset
                    const tDy = Math.cos(aRad) * range;
                    const tDx = Math.sin(aRad) * range;
                    const tLat = s.lat + (tDy / 111111);
                    const tLng = s.lng + (tDx / (111111 * Math.cos(s.lat * rad)));

                    geometry = `<MultiGeometry><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point><LineString><coordinates>${p.lng},${p.lat},0 ${tLng.toFixed(6)},${tLat.toFixed(6)},0</coordinates></LineString></MultiGeometry>`;
                }
            }

            // RICH HTML DESCRIPTION GENERATOR
            const genDesc = () => {
                let html = `<div style="font-family:Arial,sans-serif; font-size:12px; width:350px;">
                    <div style="background:#333; color:#fff; padding:5px; font-weight:bold; border-radius:3px 3px 0 0;">
                        ${metricName}: ${val} <span style="float:right; font-weight:normal; font-size:11px;">${p.time}</span>
                    </div>
                    <table style="width:100%; border-collapse:collapse; background:#fff; color:#333; font-size:11px; border:1px solid #ccc;">
                        <tr style="background:#f3f4f6; border-bottom:1px solid #ddd;">
                            <th style="text-align:left; padding:4px;">Type</th>
                            <th style="padding:4px;">Cell/PCI</th>
                            <th style="padding:4px;">RSCP</th>
                            <th style="padding:4px;">EcNo</th>
                            <th style="padding:4px;">Freq</th>
                        </tr>`;

                const row = (label, cell, rscp, ecno, freq, bg = '#fff', bold = false) => {
                    const style = `padding:3px; border-bottom:1px solid #eee; background:${bg}; ${bold ? 'font-weight:bold;' : ''}`;
                    return `<tr>
                        <td style="${style}">${label}</td>
                        <td style="${style}">${cell || '-'}</td>
                        <td style="${style}; text-align:right;">${rscp || '-'}</td>
                        <td style="${style}; text-align:right;">${ecno || '-'}</td>
                        <td style="${style}; text-align:right;">${freq || '-'}</td>
                    </tr>`;
                };

                const getName = (searchPci, searchId, searchFreq) => {
                    if (window.resolveSmartSite) {
                        const res = window.resolveSmartSite({
                            sc: searchPci,
                            cellId: searchId,
                            freq: searchFreq,
                            lat: p.lat,
                            lng: p.lng
                        });
                        return res.name;
                    }
                    return null;
                }

                // Serving
                const s = p.parsed && p.parsed.serving ? p.parsed.serving : {};
                const sId = p.cellId || s.cellId; // Prefer Top Level
                const sSc = p.sc ?? s.sc ?? s.pci;
                const sRscp = p.level ?? p.rscp ?? s.level ?? s.rscp;
                const sEcno = p.ecno ?? s.ecno;
                const sFreq = p.freq ?? s.freq;

                // Format ID
                let sIdStr = sId;
                if (sId && sId > 65535 && !String(sId).includes('/')) {
                    sIdStr = `${sId >> 16}/${sId & 0xFFFF}`;
                }

                const sName = getName(sSc, sId, sFreq);
                const sLabel = sName ? `<b>${sName}</b><br/><span style="color:#666; font-size:9px;">${sSc || '-'} (${sIdStr || '-'})</span>` : `${sSc || '-'} <span style="color:#888">(${sIdStr || '-'})</span>`;

                html += row('Serving', sLabel, sRscp, sEcno, sFreq, '#eff6ff', true);

                // Active Set (A1..A3)
                // A1 is implicitly Serving usually, checking A2/A3
                if (p.a2_sc !== undefined && p.a2_sc !== null && p.a2_sc !== '') {
                    const name = getName(p.a2_sc, p.a2_cellid, sFreq);
                    const label = name ? `<b>${name}</b><br/><span style="font-size:9px;">${p.a2_sc}</span>` : (p.a2_cellid || p.a2_sc);
                    html += row('Active 2', label, p.a2_rscp, '-', sFreq);
                }
                if (p.a3_sc !== undefined && p.a3_sc !== null && p.a3_sc !== '') {
                    const name = getName(p.a3_sc, p.a3_cellid, sFreq);
                    const label = name ? `<b>${name}</b><br/><span style="font-size:9px;">${p.a3_sc}</span>` : (p.a3_cellid || p.a3_sc);
                    html += row('Active 3', label, p.a3_rscp, '-', sFreq);
                }

                // Parsed Neighbors
                if (p.parsed && p.parsed.neighbors && p.parsed.neighbors.length > 0) {
                    p.parsed.neighbors.forEach((n, i) => {
                        const name = getName(n.pci, null, n.freq);
                        const label = name ? `<b>${name}</b><br/><span style="font-size:9px;">${n.pci}</span>` : n.pci;
                        html += row(`N${i + 1}`, label, n.rscp, n.ecno, n.freq);
                    });
                }

                html += `</table>
                    <div style="margin-top:5px; font-size:10px; color:#666;">
                        Lat: ${p.lat}, Lng: ${p.lng}
                    </div>
                 </div>`;
                return html;
            };

            const desc = `<![CDATA[${genDesc()}]]>`;

            // NOTE: The previous `exportToKML` had a massive HTML table generator.
            // I should probably extract that generator if I want to persist it, or just simplify here.
            // Given the user wants "dots colored... export... import serving sectors", the table is likely secondary, 
            // but degrading it is bad.
            // I will use a simplified description for the Unified export to avoid massive code dupe, 
            // unless I refactor `renderRow` out. 
            // Let's stick to simple extraction for now.

            if (!groups.has(groupName)) groups.set(groupName, []);
            groups.get(groupName).push(`    <Placemark><name></name><description>${desc}</description><styleUrl>#sm_${styleId}</styleUrl>${geometry}</Placemark>`);
        });

        // Build Folders String
        let folders = '';
        const sortedKeys = Array.from(groups.keys()).sort();
        let orderedKeys = sortedKeys;
        if (thresholds) {
            const tLabels = thresholds.map(t => t.label);
            const others = sortedKeys.filter(k => !tLabels.includes(k));
            orderedKeys = [...tLabels.filter(k => groups.has(k)), ...others];
        }
        orderedKeys.forEach(k => {
            folders += `    <Folder>\n      <name>${escapeXml(k)}</name>\n` + groups.get(k).join('\n') + `\n    </Folder>\n`;
        });

        return { styles: styleDefs, folders: folders };
    }

    // internal helper for sites
    _generateSitesKMLParts(activePoints) {
        if (!this.siteIndex || !this.siteIndex.all) return { styles: [], placemarks: [] };
        // ... (Logic from exportSitesToKML, filtering by activePoints) ...
        // Returns { styles: [{id, xml}], placemarks: [string] }

        const settings = this.siteSettings || {};
        const range = parseInt(settings.range) || 100;
        const beam = parseInt(settings.beamwidth) || 35;
        const rad = Math.PI / 180;

        const escapeXml = (unsafe) => {
            if (unsafe === undefined) return '';
            return String(unsafe).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c]));
        };
        const hexToKmlColor = (hex) => {
            if (!hex || hex[0] !== '#') return '99cccccc';
            return 'cc' + hex.substring(5, 7) + hex.substring(3, 5) + hex.substring(1, 3);
        };

        const styles = new Set();
        const styleDefs = [];
        const placemarks = [];

        // IDENTIFY RELEVANT SITES
        const relevantSiteIds = new Set();
        if (activePoints) {
            activePoints.forEach(p => {
                if (p.cellId) relevantSiteIds.add(String(p.cellId));
                if (window.resolveSmartSite) {
                    const res = window.resolveSmartSite(p);
                    if (res && res.id) relevantSiteIds.add(String(res.id));
                }
            });
        }

        const activeIds = new Set(this.activeMetricStats ? this.activeMetricStats.keys() : []);
        const labeledSites = new Set();

        this.siteIndex.all.forEach(s => {
            if (s.lat === undefined || s.lng === undefined) return;

            // Strict Filter
            const sIdFull = String(s.cellId);
            const sIdCid = String(s.cid);
            if (relevantSiteIds.size > 0 && !relevantSiteIds.has(sIdFull) && !relevantSiteIds.has(sIdCid)) return;

            // Geometry (Wedge)
            const azimuth = parseFloat(s.beam || s.azimuth || 0);
            const startAngle = (azimuth - beam / 2) * rad;
            const endAngle = (azimuth + beam / 2) * rad;
            const latRad = s.lat * rad;
            const coords = [`${s.lng},${s.lat},0`];
            for (let i = 0; i <= 10; i++) {
                const a = startAngle + (endAngle - startAngle) * (i / 10);
                const dy = Math.cos(a) * range;
                const dx = Math.sin(a) * range;
                const dLat = dy / 111111;
                const dLng = dx / (111111 * Math.cos(latRad));
                coords.push(`${s.lng + dLng},${s.lat + dLat},0`);
            }
            coords.push(`${s.lng},${s.lat},0`);

            // Color Sync
            let id = s.cellId;
            if (activeIds.has(String(s.cid))) id = s.cid;
            else if (activeIds.has(String(s.cellId))) id = s.cellId;

            const color = this.getDiscreteColor(id);
            const safeColorSuffix = color.replace('#', '');
            const styleId = 'site_s_' + safeColorSuffix;

            if (!styles.has(styleId)) {
                styles.add(styleId);
                const kColor = hexToKmlColor(color);
                styleDefs.push({ id: styleId, xml: `<Style id="${styleId}"><LineStyle><color>ff000000</color><width>1</width></LineStyle><PolyStyle><color>${kColor}</color><fill>1</fill><outline>1</outline></PolyStyle><IconStyle><scale>0</scale></IconStyle><LabelStyle><scale>1.1</scale></LabelStyle></Style>\n` });
            }

            const siteName = s.cellName || s.name || s.siteName || '';
            const siteUniqueKey = `${s.lat}_${s.lng}_${siteName}`;

            let geometryXml = '';
            // Use simple polygon, skip spider lines here as points have them
            if (!labeledSites.has(siteUniqueKey)) {
                labeledSites.add(siteUniqueKey);
                geometryXml = `<MultiGeometry><Point><coordinates>${s.lng},${s.lat},0</coordinates></Point><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry>`;
            } else {
                geometryXml = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
            }

            placemarks.push(`    <Placemark><name>${escapeXml(siteName)}</name><styleUrl>#${styleId}</styleUrl>${geometryXml}</Placemark>`);
        });

        return { styles: styleDefs, placemarks: placemarks };
    }

}
