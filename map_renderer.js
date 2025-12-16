class MapRenderer {
    constructor(elementId) {
        this.map = L.map(elementId).setView([33.5, -7.5], 6); // Default to Morocco view

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
        if (val === undefined || isNaN(val)) return '#888';

        // 3G RSCP / Level
        if (['level', 'rscp', 'n1_rscp', 'n2_rscp', 'n3_rscp'].includes(metric)) {
            if (val > -70) return '#22c55e';
            if (val > -85) return '#84cc16';
            if (val > -95) return '#eab308';
            if (val > -105) return '#f97316';
            return '#ef4444';
        }

        // EcNo (dB) - typically -0.5 to -20
        // > -6 Excellent
        // -6 to -10 Good
        // -10 to -14 Fair
        // < -14 Poor
        if (['ecno', 'n1_ecno', 'n2_ecno', 'n3_ecno'].includes(metric)) {
            if (val > -6) return '#22c55e';
            if (val > -10) return '#84cc16';
            if (val > -14) return '#eab308';
            if (val > -18) return '#f97316';
            return '#ef4444';
        }

        // Default / Frequency / Count
        // Use discrete coloring for IDs
        if (['cellId', 'pci', 'sc', 'lac', 'serving_cell_name'].includes(metric)) {
            return this.getDiscreteColor(val);
        }

        return '#3b82f6';
    }

    getDiscreteColor(val) {
        if (!val) return '#888';
        // Simple hash to color
        let hash = 0;
        const str = String(val);
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
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

        // Use a simpler rendering for large datasets to avoid browser freeze
        // But for <10k points, CircleMarker is fine.

        points.forEach(p => {
            // Determine value based on metric
            // Checks top-level or parsed.serving
            let val = p[metric];

            // Special handling for Serving Cell Name
            if (metric === 'serving_cell_name') {
                val = this.resolveServingName(p) || 'Unknown';
            }

            // Special handling for rscp / rscp_not_combined
            if (metric === 'rscp_not_combined' || metric === 'rscp') {
                if (val === undefined) val = p.level;
                if (val === undefined) val = p.rscp;
                if (val === undefined && p.parsed && p.parsed.serving) val = p.parsed.serving.level; // fallback
            }

            // Special handling for active_set_ metrics
            if (metric.startsWith('active_set_')) {
                const sub = metric.replace('active_set_', '').toLowerCase();
                val = p[sub];
            }

            if (val === undefined && p.parsed && p.parsed.serving) val = p.parsed.serving[metric];

            const color = this.getColor(val, metric);

            const marker = L.circleMarker([p.lat, p.lng], {
                radius: 5,
                fillColor: color,
                color: "#000",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(layerGroup);

            // Add Click Event for Sync
            marker.on('click', () => {
                window.dispatchEvent(new CustomEvent('map-point-clicked', {
                    detail: { logId: id, point: p }
                }));
                // We don't bind popup anymore, we updated the global info panel via the sync loop.
            });
        });

        this.logLayers[id] = layerGroup;
        layerGroup.addTo(this.map);

        if (points.length > 0) {
            const bounds = points.map(p => [p.lat, p.lng]);
            this.map.fitBounds(bounds);
        }
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

            // 4. Ensure view contains it (optional padding)
            if (!this.map.getBounds().contains(latLng)) {
                this.map.panTo(latLng);
            }
        }
    }

    updateLayerMetric(id, points, metric) {
        this.removeLogLayer(id);
        this.addLogLayer(id, points, metric);
    }

    removeLogLayer(id) {
        if (this.logLayers[id]) {
            this.map.removeLayer(this.logLayers[id]);
            delete this.logLayers[id];
        }
    }

    addSiteLayer(sectors) {
        this.siteData = sectors; // Store original data
        this.renderSites(true); // Fit bounds on initial load
    }

    updateSiteSettings(settings) {
        this.siteSettings = { ...this.siteSettings, ...settings };
        if (this.siteData) {
            this.renderSites(false); // Do NOT fit bounds on settings update
        }
    }

    renderSites(fitBounds = false) {
        if (this.sitesLayer) {
            this.map.removeLayer(this.sitesLayer);
        }
        this.sitesLayer = L.layerGroup();

        // Clear Labels
        if (this.siteLabelsLayer) {
            this.siteLabelsLayer.clearLayers();
        }

        // Defaults
        const range = this.siteSettings && this.siteSettings.range ? parseInt(this.siteSettings.range) : 200;
        const beamwidth = this.siteSettings && this.siteSettings.beamwidth ? parseInt(this.siteSettings.beamwidth) : 60;
        const opacity = this.siteSettings && this.siteSettings.opacity ? parseFloat(this.siteSettings.opacity) : 0.6;
        const overrideColor = this.siteSettings && this.siteSettings.useOverride ? this.siteSettings.color : null;

        const renderedSiteLabels = new Set(); // Track unique site names to avoid duplicates
        this.sitePolygons = {}; // Lookup for highlighting

        this.siteData.forEach(s => {
            if (s.lat === undefined || s.lng === undefined || isNaN(s.lat) || isNaN(s.lng)) return;

            const azimuth = s.azimuth || 0;

            // Calculate Triangle Vertices
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

            const p1 = getPoint(s.lat, s.lng, azimuth - beamwidth / 2, range);
            const p2 = getPoint(s.lat, s.lng, azimuth + beamwidth / 2, range);

            const color = overrideColor || s.color || '#3b82f6';

            const polygon = L.polygon([center, p1, p2], {
                color: '#333',
                weight: 1,
                fillColor: color,
                fillOpacity: opacity
            }).addTo(this.sitesLayer);

            if (s.cellId) {
                this.sitePolygons[s.cellId] = polygon;
            }

            // Labels - Add to siteLabelsLayer
            if (this.siteSettings && this.siteSettings.showSiteNames) {
                const siteName = s.siteName || s.name; // Prioritize siteName

                // Deduplicate: Only render if we haven't seen this site name yet
                if (siteName && !renderedSiteLabels.has(siteName)) {
                    renderedSiteLabels.add(siteName);

                    const siteLabel = L.marker(center, {
                        icon: L.divIcon({
                            className: 'site-label',
                            html: `<div style="color:#fff; font-size:10px; text-shadow:0 0 2px #000; white-space:nowrap;">${siteName}</div>`,
                            iconAnchor: [20, 10] // Centerish
                        }),
                        interactive: false
                    }).addTo(this.siteLabelsLayer);
                }
            }

            if (this.siteSettings && this.siteSettings.showCellNames) {
                const tipMid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
                const cellLabel = L.marker(tipMid, {
                    icon: L.divIcon({
                        className: 'cell-label',
                        html: `<div style="color:#ddd; font-size:9px; text-shadow:0 0 2px #000; white-space:nowrap;">${s.cellId || ''}</div>`,
                        iconAnchor: [10, 0]
                    }),
                    interactive: false
                }).addTo(this.siteLabelsLayer);
            }

            // Bind Popup
            const content = `
                <div style="font-family: sans-serif; font-size: 13px;">
                    <strong>${s.name || 'Unknown Site'}</strong><br>
                    Cell: ${s.cellId || '-'}<br>
                    Azimuth: ${azimuth}°<br>
                    Tech: ${s.tech || '-'}
                </div>
            `;
            polygon.bindPopup(content);
        });

        this.sitesLayer.addTo(this.map);

        // Update visibility based on zoom
        this.updateLabelVisibility();

        // Fit bounds only if requested
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
