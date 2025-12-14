class MapRenderer {
    constructor(elementId) {
        this.map = L.map(elementId).setView([33.5, -7.5], 6); // Default to Morocco view

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);

        this.logLayers = {}; // Store layers by ID/Name
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
        return '#3b82f6';
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

        // Defaults
        const range = this.siteSettings && this.siteSettings.range ? parseInt(this.siteSettings.range) : 200;
        const beamwidth = this.siteSettings && this.siteSettings.beamwidth ? parseInt(this.siteSettings.beamwidth) : 60;
        const opacity = this.siteSettings && this.siteSettings.opacity ? parseFloat(this.siteSettings.opacity) : 0.6;
        const overrideColor = this.siteSettings && this.siteSettings.useOverride ? this.siteSettings.color : null;

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

            // Labels
            if (this.siteSettings && this.siteSettings.showSiteNames) {
                const siteLabel = L.marker(center, {
                    icon: L.divIcon({
                        className: 'site-label',
                        html: `<div style="color:#fff; font-size:10px; text-shadow:0 0 2px #000; white-space:nowrap;">${s.name}</div>`,
                        iconAnchor: [20, 10] // Centerish
                    }),
                    interactive: false
                }).addTo(this.sitesLayer);
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
                }).addTo(this.sitesLayer);
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

        // Fit bounds only if requested
        if (fitBounds && this.siteData.length > 0) {
            const bounds = L.latLngBounds(this.siteData.map(s => [s.lat, s.lng]));
            this.map.fitBounds(bounds.pad(0.1));
        }
    }
}
